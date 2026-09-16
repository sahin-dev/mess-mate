import {
  addActivity,
  defaultSettings,
  ensureIndexes,
  getWorkspaceData,
  MEMBER_COLORS,
  type BazarDocument,
  type ExpenseDocument,
  type MealDocument,
  type MemberDocument,
  type RoomDocument,
} from "@/lib/data";
import { after } from "next/server";
import { invitationEmail } from "@/lib/email-templates";
import { sendMail } from "@/lib/mail";
import { isPeriod, type Period } from "@/lib/period";
import {
  cutoffHasPassed,
  DEFAULT_TIMEZONE,
  isValidTimezone,

  periodInZone,
  todayInZone,
} from "@/lib/timezone";
import {
  ApiError,
  assertSameOrigin,
  cleanEmail,
  cleanNumber,
  cleanString,
  createJoinCode,
  jsonError,
  newId,
  readJsonBody,
  requireManager,
  requireSession,
  requireWorkspace,
  setActiveWorkspace,
  type MessDocument,
} from "@/lib/server-utils";
import type { MessSettings, Room, UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roomAccents: Room["accent"][] = ["coral", "blue", "green", "gold"];
/** A proof image is stored inline as a data URL; keep it well under the 16 MB document limit. */
const MAX_PROOF_CHARS = 3_500_000;

function dateString(value: unknown, field = "Date") {
  const date = cleanString(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new ApiError(400, `${field} is invalid.`);
  }
  return date;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApiError(400, `${field} is invalid.`);
  }
  return value as T;
}

function periodFrom(value: unknown, timeZone = DEFAULT_TIMEZONE): Period {
  return isPeriod(value) ? value : periodInZone(timeZone);
}

/**
 * Enforces the mess's own meal rules. Planning future days is always allowed;
 * today closes at the cutoff and past days are the manager's to correct.
 *
 * "Today" and the cutoff are read in the mess's own timezone, so a house in
 * Dhaka closes at 22:30 Dhaka time no matter where the server runs.
 */
function assertMealEditable(date: string, settings: MessSettings, role: UserRole) {
  if (role === "manager" || role === "admin" || settings.allowAnytime) return;
  const today = todayInZone(settings.timezone);
  if (date > today) return;
  if (date < today) {
    throw new ApiError(409, "Past days are locked. Ask your manager to correct them.");
  }
  if (cutoffHasPassed(settings.timezone, settings.cutoff)) {
    throw new ApiError(
      409,
      `Entries for today closed at ${settings.cutoff} (${settings.timezone.replace(/_/g, " ")}).`,
    );
  }
}

function timezoneOrThrow(value: unknown) {
  if (value === undefined || value === null || value === "") return DEFAULT_TIMEZONE;
  if (!isValidTimezone(value)) {
    throw new ApiError(400, "That is not a recognised timezone.");
  }
  return value;
}

async function uniqueJoinCode(
  db: Awaited<ReturnType<typeof requireSession>>["db"],
  name: string,
) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const joinCode = createJoinCode(name);
    if (!(await db.collection<MessDocument>("messes").findOne({ joinCode }))) return joinCode;
  }
  throw new ApiError(503, "Could not generate a join code. Please try again.");
}

export async function GET(request: Request) {
  try {
    const { db, user, mess, role } = await requireWorkspace();
    const period = periodFrom(new URL(request.url).searchParams.get("period"));
    return Response.json(await getWorkspaceData(db, user, mess.id, role, period));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await readJsonBody(request);
    const action = cleanString(body.action, "Action", 40);
    const period = periodFrom(body.period);

    if (action === "createMess") {
      const { db, session, user } = await requireSession();
      await ensureIndexes(db);
      const name = cleanString(body.name, "Mess name", 80);
      const location = cleanString(body.location, "Location", 120);
      const expectedMembers = Math.round(cleanNumber(body.memberCount, "Expected members", 1, 100));
      const messId = newId("mess");
      const joinCode = await uniqueJoinCode(db, name);
      const createdAt = new Date().toISOString();
      const mess: MessDocument = {
        id: messId,
        name,
        location,
        expectedMembers,
        joinCode,
        managerId: user.id,
        settings: defaultSettings,
        createdAt,
      };
      const member: MemberDocument = {
        id: user.id,
        messId,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: "Manager",
        roomId: null,
        status: "active",
        joinedAt: createdAt.slice(0, 10),
        color: MEMBER_COLORS[0],
      };
      await db.collection<MessDocument>("messes").insertOne(mess);
      await db.collection<MemberDocument>("members").insertOne(member);
      await setActiveWorkspace(db, session, messId, "manager");
      await addActivity(db, messId, "Mess created", `${user.name} created ${name}`, "green");
      return Response.json(await getWorkspaceData(db, user, messId, "manager", period), {
        status: 201,
      });
    }

    if (action === "joinMess") {
      const { db, session, user } = await requireSession();
      const joinCode = cleanString(body.joinCode, "Join code", 20).toUpperCase();
      const mess = await db.collection<MessDocument>("messes").findOne({ joinCode });
      if (!mess) throw new ApiError(404, "No mess matches that join code. Check it with your manager.");
      const existing = await db
        .collection<MemberDocument>("members")
        .findOne({ messId: mess.id, email: user.email });
      if (existing) {
        await db.collection<MemberDocument>("members").updateOne(
          { id: existing.id, messId: mess.id },
          {
            $set: {
              userId: user.id,
              name: user.name,
              status: "active",
              role: existing.role === "Manager" ? "Manager" : "Member",
            },
          },
        );
      } else {
        const memberCount = await db.collection("members").countDocuments({ messId: mess.id });
        await db.collection<MemberDocument>("members").insertOne({
          id: user.id,
          messId: mess.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          role: "Member",
          roomId: null,
          status: "active",
          joinedAt: todayInZone(DEFAULT_TIMEZONE),
          color: MEMBER_COLORS[memberCount % MEMBER_COLORS.length],
        });
      }
      const role: UserRole = existing?.role === "Manager" ? "manager" : "member";
      await setActiveWorkspace(db, session, mess.id, role);
      await addActivity(db, mess.id, "Member joined", `${user.name} joined the mess`, "green");
      return Response.json(await getWorkspaceData(db, user, mess.id, role, period));
    }

    const { db, user, mess, role } = await requireWorkspace();
    const messId = mess.id;
    const settings: MessSettings = {
      ...defaultSettings,
      ...(mess.settings as Partial<MessSettings>),
    };

    if (action === "saveMeals") {
      const date = dateString(body.date);
      assertMealEditable(date, settings, role);
      const meals = body.meals as Record<string, unknown> | undefined;
      if (!meals) throw new ApiError(400, "Meal values are required.");
      const values = {
        breakfast: Math.round(cleanNumber(meals.breakfast, "Breakfast", 0, 9)),
        lunch: Math.round(cleanNumber(meals.lunch, "Lunch", 0, 9)),
        dinner: Math.round(cleanNumber(meals.dinner, "Dinner", 0, 9)),
      };
      await db.collection<MealDocument>("meals").updateOne(
        { messId, userId: user.id, date },
        {
          $set: { ...values, status: settings.mealApproval ? "Pending" : "Open" },
          $setOnInsert: { id: newId("meal"), messId, userId: user.id, date },
        },
        { upsert: true },
      );
    } else if (action === "addExpense") {
      requireManager(role);
      const expense: ExpenseDocument = {
        id: newId("expense"),
        messId,
        title: cleanString(body.title, "Expense title", 100),
        amount: cleanNumber(body.amount, "Amount", 1),
        category: enumValue(
          body.category,
          ["Fixed", "Utility", "Maintenance", "Other"] as const,
          "Category",
        ),
        splitMethod: enumValue(
          body.splitMethod,
          ["All members equally", "By room"] as const,
          "Split method",
        ),
        date: dateString(body.date ?? todayInZone(settings.timezone)),
        createdBy: cleanString(body.paidById ?? user.id, "Paid by", 100),
        createdAt: new Date().toISOString(),
      };
      // The payer has to be someone in this mess, or the balances will not add up.
      const payer = await db
        .collection<MemberDocument>("members")
        .findOne({ id: expense.createdBy, messId, status: "active" });
      if (!payer) throw new ApiError(400, "Choose an active member who paid for this expense.");
      await db.collection<ExpenseDocument>("expenses").insertOne(expense);
      await addActivity(
        db,
        messId,
        `${expense.title} added`,
        `${user.name} recorded BDT ${expense.amount.toLocaleString("en-US")} paid by ${payer.name}`,
        "coral",
      );
    } else if (action === "deleteExpense") {
      requireManager(role);
      const id = cleanString(body.id, "Expense", 100);
      const result = await db.collection<ExpenseDocument>("expenses").deleteOne({ id, messId });
      if (!result.deletedCount) throw new ApiError(404, "That expense no longer exists.");
    } else if (action === "addBazar") {
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length || rawItems.length > 30) {
        throw new ApiError(400, "List between 1 and 30 purchased items.");
      }
      const items = rawItems.map((item, index) => {
        const record = item as Record<string, unknown>;
        return {
          name: cleanString(record.name, `Item ${index + 1}`, 80),
          quantity: typeof record.quantity === "string" ? record.quantity.trim().slice(0, 40) : "",
        };
      });
      let proof: BazarDocument["proof"];
      if (body.proof && typeof body.proof === "object") {
        const rawProof = body.proof as Record<string, unknown>;
        const name = cleanString(rawProof.name, "Proof filename", 180);
        const type = enumValue(
          rawProof.type,
          ["image/png", "image/jpeg", "image/webp"] as const,
          "Proof type",
        );
        const data = cleanString(rawProof.data, "Proof image", MAX_PROOF_CHARS + 1);
        if (data.length > MAX_PROOF_CHARS) {
          throw new ApiError(413, "That image is too large. Use one under 2 MB.");
        }
        if (!data.startsWith(`data:${type};base64,`)) {
          throw new ApiError(400, "The proof image could not be read.");
        }
        proof = { name, type, data };
      }
      if (settings.requireProof && !proof) {
        throw new ApiError(400, "This mess requires a receipt photo with every bazar entry.");
      }
      const entry: BazarDocument = {
        id: newId("bazar"),
        messId,
        memberId: user.id,
        by: user.name,
        date: dateString(body.date),
        items,
        amount: cleanNumber(body.amount, "Total amount", 1),
        status: settings.bazarApproval ? "Pending" : "Approved",
        proof,
        proofName: proof?.name,
        createdAt: new Date().toISOString(),
      };
      await db.collection<BazarDocument>("bazar").insertOne(entry);
      await addActivity(
        db,
        messId,
        "Bazar submitted",
        `${user.name} submitted BDT ${entry.amount.toLocaleString("en-US")}`,
        "green",
      );
    } else if (action === "toggleBazarStatus") {
      requireManager(role);
      const id = cleanString(body.id, "Bazar entry", 100);
      const status = enumValue(body.status, ["Pending", "Approved"] as const, "Status");
      const result = await db
        .collection<BazarDocument>("bazar")
        .updateOne({ id, messId }, { $set: { status } });
      if (!result.matchedCount) throw new ApiError(404, "That bazar entry no longer exists.");
      await addActivity(
        db,
        messId,
        status === "Approved" ? "Bazar approved" : "Bazar reopened",
        `${user.name} marked an entry ${status.toLowerCase()}`,
        status === "Approved" ? "green" : "coral",
      );
    } else if (action === "deleteBazar") {
      const id = cleanString(body.id, "Bazar entry", 100);
      // Members may withdraw their own entry; managers may remove any.
      const filter =
        role === "manager" || role === "admin" ? { id, messId } : { id, messId, memberId: user.id };
      const result = await db.collection<BazarDocument>("bazar").deleteOne(filter);
      if (!result.deletedCount) {
        throw new ApiError(404, "That entry no longer exists, or it is not yours to remove.");
      }
    } else if (action === "addRoom") {
      requireManager(role);
      const roomCount = await db.collection<RoomDocument>("rooms").countDocuments({ messId });
      const room: RoomDocument = {
        id: newId("room"),
        messId,
        name: cleanString(body.name, "Room name", 60),
        type: cleanString(body.type || "Shared room", "Room description", 80),
        rent: cleanNumber(body.rent, "Monthly rent", 0),
        capacity: Math.round(cleanNumber(body.capacity, "Capacity", 1, 20)),
        accent: roomAccents[roomCount % roomAccents.length],
      };
      await db.collection<RoomDocument>("rooms").insertOne(room);
      await addActivity(db, messId, "Room added", `${room.name} was added to the house`, "blue");
    } else if (action === "deleteRoom") {
      requireManager(role);
      const id = cleanString(body.id, "Room", 100);
      if (await db.collection<MemberDocument>("members").findOne({ messId, roomId: id })) {
        throw new ApiError(409, "Move the residents out before deleting this room.");
      }
      const result = await db.collection<RoomDocument>("rooms").deleteOne({ id, messId });
      if (!result.deletedCount) throw new ApiError(404, "That room no longer exists.");
    } else if (action === "assignMember") {
      requireManager(role);
      const memberId = cleanString(body.memberId, "Member", 100);
      const roomId =
        body.roomId === null || body.roomId === "" ? null : cleanString(body.roomId, "Room", 100);
      if (roomId) {
        const room = await db.collection<RoomDocument>("rooms").findOne({ id: roomId, messId });
        if (!room) throw new ApiError(404, "That room no longer exists.");
        const member = await db
          .collection<MemberDocument>("members")
          .findOne({ id: memberId, messId });
        const occupied = await db
          .collection<MemberDocument>("members")
          .countDocuments({ messId, roomId });
        if (occupied >= room.capacity && member?.roomId !== roomId) {
          throw new ApiError(409, `${room.name} is already full.`);
        }
      }
      const result = await db
        .collection<MemberDocument>("members")
        .updateOne({ id: memberId, messId }, { $set: { roomId } });
      if (!result.matchedCount) throw new ApiError(404, "That member no longer exists.");
    } else if (action === "inviteMember") {
      requireManager(role);
      const email = cleanEmail(body.email);
      if (await db.collection<MemberDocument>("members").findOne({ messId, email })) {
        throw new ApiError(409, "That person is already a member or already invited.");
      }
      const roomId = typeof body.roomId === "string" && body.roomId ? body.roomId : null;
      const memberCount = await db.collection("members").countDocuments({ messId });
      const member: MemberDocument = {
        id: newId("member"),
        messId,
        userId: null,
        name: email
          .split("@")[0]
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        email,
        role: "Invited",
        roomId,
        status: "invited",
        joinedAt: todayInZone(settings.timezone),
        color: MEMBER_COLORS[memberCount % MEMBER_COLORS.length],
      };
      await db.collection<MemberDocument>("members").insertOne(member);
      await addActivity(db, messId, "Member invited", `${user.name} invited ${email}`, "green");
      // The invitation is already saved; sending happens after the response so
      // a slow or failing mail server never blocks or undoes it.
      after(async () => {
        const result = await sendMail(
          invitationEmail({
            to: email,
            messName: mess.name,
            inviterName: user.name,
            joinCode: mess.joinCode,
            location: mess.location,
          }),
        );
        if (!result.ok) {
          console.warn(`[messmate] invitation email to ${email} was not delivered: ${result.error}`);
        }
      });
    } else if (action === "setMemberRole") {
      requireManager(role);
      const id = cleanString(body.id, "Member", 100);
      const nextRole = enumValue(body.role, ["Manager", "Member"] as const, "Role");
      if (id === mess.managerId && nextRole === "Member") {
        throw new ApiError(409, "The mess owner has to stay a manager.");
      }
      const member = await db
        .collection<MemberDocument>("members")
        .findOne({ id, messId, status: "active" });
      if (!member) throw new ApiError(404, "That member is not active in this mess.");
      await db
        .collection<MemberDocument>("members")
        .updateOne({ id, messId }, { $set: { role: nextRole } });
      // Any live session for that member has to pick up the new role too.
      if (member.userId) {
        await db
          .collection("sessions")
          .updateMany(
            { userId: member.userId, activeMessId: messId },
            { $set: { role: nextRole === "Manager" ? "manager" : "member" } },
          );
      }
      await addActivity(
        db,
        messId,
        "Role updated",
        `${user.name} made ${member.name} a ${nextRole.toLowerCase()}`,
        "blue",
      );
    } else if (action === "deleteMember") {
      requireManager(role);
      const id = cleanString(body.id, "Member", 100);
      if (id === mess.managerId) throw new ApiError(409, "The mess owner cannot be removed.");
      const member = await db.collection<MemberDocument>("members").findOne({ id, messId });
      if (!member) throw new ApiError(404, "That member no longer exists.");
      const owes = await db
        .collection<BazarDocument>("bazar")
        .countDocuments({ messId, memberId: id, status: "Pending" });
      if (owes) {
        throw new ApiError(409, "Settle or remove their pending bazar entries first.");
      }
      await db.collection<MemberDocument>("members").deleteOne({ id, messId });
      if (member.userId) {
        await db
          .collection("sessions")
          .updateMany(
            { userId: member.userId, activeMessId: messId },
            { $set: { activeMessId: null, role: null } },
          );
      }
      await addActivity(db, messId, "Member removed", `${user.name} removed ${member.name}`, "coral");
    } else if (action === "saveSettings") {
      requireManager(role);
      const incoming = body.settings as MessSettings | undefined;
      if (!incoming || typeof incoming !== "object") throw new ApiError(400, "Settings are required.");
      const sanitized: MessSettings = {
        mealTypes: {
          breakfast: Boolean(incoming.mealTypes?.breakfast),
          lunch: Boolean(incoming.mealTypes?.lunch),
          dinner: Boolean(incoming.mealTypes?.dinner),
        },
        allowAnytime: Boolean(incoming.allowAnytime),
        cutoff: /^([01]\d|2[0-3]):[0-5]\d$/.test(incoming.cutoff) ? incoming.cutoff : "22:30",
        timezone: timezoneOrThrow(incoming.timezone),
        mealApproval: Boolean(incoming.mealApproval),
        bazarApproval: Boolean(incoming.bazarApproval),
        requireProof: Boolean(incoming.requireProof),
        rosterFrequency: enumValue(
          incoming.rosterFrequency,
          ["alternate", "daily", "weekly", "custom"] as const,
          "Roster frequency",
        ),
        notifications: {
          cutoff: Boolean(incoming.notifications?.cutoff),
          roster: Boolean(incoming.notifications?.roster),
          settlement: Boolean(incoming.notifications?.settlement),
        },
        fixedExpenses: Array.isArray(incoming.fixedExpenses)
          ? incoming.fixedExpenses.slice(0, 30).map((expense, index) => ({
              id: typeof expense.id === "string" ? expense.id : newId("fixed"),
              title: cleanString(expense.title, `Fixed expense ${index + 1}`, 80),
              amount: cleanNumber(expense.amount, `Fixed expense ${index + 1} amount`, 0),
            }))
          : [],
      };
      if (!sanitized.mealTypes.breakfast && !sanitized.mealTypes.lunch && !sanitized.mealTypes.dinner) {
        throw new ApiError(400, "Keep at least one meal enabled.");
      }
      await db
        .collection<MessDocument>("messes")
        .updateOne({ id: messId }, { $set: { settings: sanitized } });
      await addActivity(db, messId, "Settings updated", `${user.name} updated the mess rules`, "blue");
    } else if (action === "regenerateJoinCode") {
      requireManager(role);
      const joinCode = await uniqueJoinCode(db, mess.name);
      await db.collection<MessDocument>("messes").updateOne({ id: messId }, { $set: { joinCode } });
      await addActivity(
        db,
        messId,
        "Join code regenerated",
        `${user.name} replaced the private join code`,
        "coral",
      );
    } else {
      throw new ApiError(400, "Unsupported workspace action.");
    }

    return Response.json(await getWorkspaceData(db, user, messId, role, period));
  } catch (error) {
    return jsonError(error);
  }
}
