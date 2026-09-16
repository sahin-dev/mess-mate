import type { Db } from "mongodb";
import {
  defaultSettings,
  type BazarDocument,
  type ExpenseDocument,
  type MealDocument,
  type MemberDocument,
  type RoomDocument,
} from "@/lib/data";
import {
  cutoffReminderEmail,
  rosterReminderEmail,
  settlementEmail,
} from "@/lib/email-templates";
import { formatMoney } from "@/lib/format";
import { sendMailBatch, type MailMessage } from "@/lib/mail";
import { periodLabel, shiftPeriod } from "@/lib/period";
import { buildRoster, computeSettlement } from "@/lib/settlement";
import type { MessDocument } from "@/lib/server-utils";
import {
  cutoffMinutes,
  minutesOfDayInZone,
  normalizeTimezone,
  todayInZone,
  zonedParts,
} from "@/lib/timezone";
import type { MessSettings } from "@/lib/types";

/**
 * Scheduled reminders.
 *
 * Every decision here is made in the mess's own timezone: a house in Dhaka gets
 * its cutoff reminder at 21:30 Dhaka time, whatever hour it is on the server.
 * Run the endpoint hourly; the log below makes repeated runs harmless.
 */

type NotificationKind = "cutoff" | "roster" | "settlement";

type NotificationLog = {
  /** messId : kind : scope : memberId — unique, so a retry cannot resend. */
  key: string;
  messId: string;
  kind: NotificationKind;
  sentAt: Date;
  expiresAt: Date;
};

export async function ensureNotificationIndexes(db: Db) {
  await Promise.all([
    db.collection<NotificationLog>("notificationLog").createIndex({ key: 1 }, { unique: true }),
    db.collection<NotificationLog>("notificationLog").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}

/**
 * Claims the right to send one notification. Returns false if it was already
 * sent, which is what stops an hourly cron from mailing the same reminder
 * twelve times.
 */
async function claim(db: Db, messId: string, kind: NotificationKind, scope: string, memberId: string) {
  const key = `${messId}:${kind}:${scope}:${memberId}`;
  try {
    await db.collection<NotificationLog>("notificationLog").insertOne({
      key,
      messId,
      kind,
      sentAt: new Date(),
      // Kept for 60 days so the log cannot grow without bound.
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60_000),
    });
    return true;
  } catch {
    return false; // Duplicate key: already sent.
  }
}

export type NotificationRun = {
  messes: number;
  cutoff: number;
  roster: number;
  settlement: number;
  failed: number;
  skipped: string[];
};

export async function runNotifications(db: Db, at = new Date()): Promise<NotificationRun> {
  await ensureNotificationIndexes(db);

  const messes = await db.collection<MessDocument>("messes").find({}).toArray();
  const run: NotificationRun = {
    messes: messes.length,
    cutoff: 0,
    roster: 0,
    settlement: 0,
    failed: 0,
    skipped: [],
  };

  for (const mess of messes) {
    const settings: MessSettings = {
      ...defaultSettings,
      ...(mess.settings as Partial<MessSettings>),
    };
    settings.timezone = normalizeTimezone(settings.timezone);

    const members = await db
      .collection<MemberDocument>("members")
      .find({ messId: mess.id, status: "active" })
      .toArray();
    const reachable = members.filter((member) => member.email?.includes("@"));
    if (!reachable.length) {
      run.skipped.push(`${mess.name}: nobody to write to`);
      continue;
    }

    const localMinutes = minutesOfDayInZone(settings.timezone, at);
    const today = todayInZone(settings.timezone, at);
    const { day: dayOfMonth } = zonedParts(settings.timezone, at);

    const messages: { message: MailMessage; kind: NotificationKind }[] = [];

    // 1. The hour before the cutoff, to whoever has not recorded today.
    if (settings.notifications.cutoff && !settings.allowAnytime) {
      const closesAt = cutoffMinutes(settings.cutoff);
      if (localMinutes >= closesAt - 60 && localMinutes < closesAt) {
        const recorded = new Set(
          (
            await db
              .collection<MealDocument>("meals")
              .find({ messId: mess.id, date: today })
              .toArray()
          )
            .filter((meal) => meal.breakfast + meal.lunch + meal.dinner > 0)
            .map((meal) => meal.userId),
        );
        for (const member of reachable) {
          // Only chase the people who have not entered anything; telling
          // everyone every evening is how reminders get filtered to spam.
          if (recorded.has(member.id)) continue;
          if (!(await claim(db, mess.id, "cutoff", today, member.id))) continue;
          messages.push({
            kind: "cutoff",
            message: cutoffReminderEmail({
              to: member.email,
              name: member.name,
              messName: mess.name,
              cutoff: settings.cutoff,
              recorded: false,
            }),
          });
        }
      }
    }

    // 2. Whoever is on bazar duty tomorrow, told during the day before.
    if (settings.notifications.roster && localMinutes >= 9 * 60 && localMinutes < 21 * 60) {
      const roster = buildRoster(members, settings.rosterFrequency, settings.timezone, at);
      const tomorrow = addDays(today, 1);
      for (const slot of roster.filter((entry) => entry.date === tomorrow)) {
        const member = reachable.find((entry) => entry.id === slot.memberId);
        if (!member) continue;
        if (!(await claim(db, mess.id, "roster", tomorrow, member.id))) continue;
        messages.push({
          kind: "roster",
          message: rosterReminderEmail({
            to: member.email,
            name: member.name,
            messName: mess.name,
            date: formatLongDate(tomorrow),
          }),
        });
      }
    }

    // 3. On the first of the month, everyone's closing position for the last one.
    if (settings.notifications.settlement && dayOfMonth === 1 && localMinutes >= 8 * 60) {
      const closed = shiftPeriod(today.slice(0, 7), -1);
      const summary = await summarise(db, mess.id, closed);
      if (summary) {
        for (const member of reachable) {
          const position = summary.settlement.members.find((entry) => entry.memberId === member.id);
          if (!position) continue;
          if (!(await claim(db, mess.id, "settlement", closed, member.id))) continue;
          messages.push({
            kind: "settlement",
            message: settlementEmail({
              to: member.email,
              name: member.name,
              messName: mess.name,
              periodLabel: periodLabel(closed),
              mealRate: formatMoney(summary.settlement.mealRate, { decimals: true }),
              meals: position.meals,
              paid: formatMoney(position.paid),
              owed: formatMoney(position.mealCost + position.expenseShare),
              balance: position.balance,
              balanceText: formatMoney(position.balance),
              transfers: summary.settlement.transfers.map(
                (transfer) => `${transfer.from} pays ${transfer.to} ${formatMoney(transfer.amount)}`,
              ),
            }),
          });
        }
      }
    }

    if (!messages.length) continue;
    const outcome = await sendMailBatch(messages.map((entry) => entry.message));
    run.failed += outcome.failed;
    for (const entry of messages) run[entry.kind] += 1;
  }

  return run;
}

/** Recomputes a closed month so the email quotes the same figures as the app. */
async function summarise(db: Db, messId: string, period: string) {
  const range = { $gte: `${period}-01`, $lte: `${period}-31` };
  const [members, rooms, meals, expenses, bazar] = await Promise.all([
    db.collection<MemberDocument>("members").find({ messId }).toArray(),
    db.collection<RoomDocument>("rooms").find({ messId }).toArray(),
    db.collection<MealDocument>("meals").find({ messId, date: range }).toArray(),
    db.collection<ExpenseDocument>("expenses").find({ messId, date: range }).toArray(),
    db.collection<BazarDocument>("bazar").find({ messId, date: range }).toArray(),
  ]);
  // A month with nothing in it is not worth an email.
  if (!meals.length && !expenses.length && !bazar.length) return null;

  return {
    settlement: computeSettlement({
      period,
      members,
      rooms,
      meals,
      bazar,
      expenses: expenses.map((expense) => ({ ...expense, paidById: expense.createdBy })),
    }),
  };
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function formatLongDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}
