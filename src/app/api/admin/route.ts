import { performance } from "node:perf_hooks";
import type { Db } from "mongodb";
import type { ActivityDocument, MemberDocument } from "@/lib/data";
import { currentPeriod, periodShortLabel, shiftPeriod } from "@/lib/period";
import { ApiError, jsonError, requireSession, type MessDocument, type UserDocument } from "@/lib/server-utils";
import type { AdminData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTORY_LIMIT = 100;

export async function GET() {
  try {
    const { db, user } = await requireSession();
    if (!user.isAdmin) throw new ApiError(403, "Platform administrator access is required.");

    const started = performance.now();
    await db.command({ ping: 1 });
    const databaseLatency = Math.max(1, Math.round(performance.now() - started));

    // Counts and rollups run in the database. Loading whole collections into
    // the handler worked while there was one demo mess and would not survive
    // real traffic.
    const [
      users,
      messes,
      meals,
      bazar,
      rooms,
      expenseVolume,
      userDocs,
      messDocs,
      memberRollup,
      activity,
      signups,
      signedInNow,
      activeDay,
      activeWeek,
      activeMonth,
      everSeen,
    ] = await Promise.all([
      db.collection("users").countDocuments(),
      db.collection("messes").countDocuments(),
      db.collection("meals").countDocuments(),
      db.collection("bazar").countDocuments(),
      db.collection("rooms").countDocuments(),
      sumField(db, "expenses", "amount"),
      db
        .collection<UserDocument>("users")
        .find({}, { projection: { id: 1, name: 1, email: 1, isAdmin: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .limit(DIRECTORY_LIMIT)
        .toArray(),
      db
        .collection<MessDocument>("messes")
        .find({}, { projection: { settings: 0 } })
        .sort({ createdAt: -1 })
        .limit(DIRECTORY_LIMIT)
        .toArray(),
      db
        .collection<MemberDocument>("members")
        .aggregate<{
          _id: string;
          active: number;
          managers: string[];
          userIds: string[];
        }>([
          {
            $group: {
              _id: "$messId",
              active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
              managers: {
                $push: { $cond: [{ $eq: ["$role", "Manager"] }, "$name", "$$REMOVE"] },
              },
              userIds: { $push: "$userId" },
            },
          },
        ])
        .toArray(),
      db
        .collection<ActivityDocument>("activity")
        .find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      loadSignups(db),
      // Signed in right now: a live session is one that has not expired. The
      // collection has a TTL index, so expired rows are swept anyway, but the
      // filter makes this correct in the window before the sweep runs.
      db
        .collection("sessions")
        .distinct("userId", { expiresAt: { $gt: new Date() } })
        .then((ids) => ids.filter(Boolean).length),
      seenSince(db, 1),
      seenSince(db, 7),
      seenSince(db, 30),
      db.collection("users").countDocuments({ lastSeenAt: { $exists: true } }),
    ]);

    const rollupByMess = new Map(memberRollup.map((row) => [row._id, row]));
    const messCountByUser = new Map<string, number>();
    for (const row of memberRollup) {
      for (const userId of row.userIds) {
        if (userId) messCountByUser.set(userId, (messCountByUser.get(userId) ?? 0) + 1);
      }
    }
    const managerIds = new Set(
      memberRollup.flatMap((row) => (row.managers.length ? [row._id] : [])),
    );
    const managerUserIds = await db
      .collection<MemberDocument>("members")
      .distinct("userId", { role: "Manager" });
    const managerUsers = new Set(managerUserIds.filter(Boolean) as string[]);

    const entryCounts = await entriesPerMess(
      db,
      messDocs.map((mess) => mess.id),
    );

    const totalFeature = meals + bazar + rooms;
    const result: AdminData = {
      stats: {
        users,
        messes,
        meals,
        expenseVolume,
        bazar,
        rooms,
        activeMesses: memberRollup.filter((row) => row.active > 0).length,
        signedInNow,
        activeDay,
        activeWeek,
        activeMonth,
        // Nobody was being counted before this shipped, so while there are
        // accounts that have never been seen the windows are an undercount.
        activityPartial: everSeen < users,
      },
      messes: messDocs.map((mess) => {
        const rollup = rollupByMess.get(mess.id);
        return {
          id: mess.id,
          name: mess.name,
          manager: rollup?.managers[0] ?? "Unassigned",
          members: rollup?.active ?? 0,
          entries: entryCounts.get(mess.id) ?? 0,
          location: mess.location,
          createdAt: mess.createdAt,
          status: (rollup?.active ?? 0) > 0 ? "Active" : "Setup",
        };
      }),
      users: userDocs.map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.isAdmin ? "Admin" : managerUsers.has(account.id) ? "Manager" : "Member",
        messes: messCountByUser.get(account.id) ?? 0,
        joinedAt: account.createdAt,
      })),
      signups,
      featureUsage: [
        { label: "Meal entries", count: meals, share: share(meals, totalFeature) },
        { label: "Bazar entries", count: bazar, share: share(bazar, totalFeature) },
        { label: "Rooms configured", count: rooms, share: share(rooms, totalFeature) },
        { label: "Active messes", count: managerIds.size, share: share(managerIds.size, messes) },
      ],
      activity: activity.map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        createdAt: item.createdAt,
        tone: item.tone,
      })),
      databaseLatency,
      generatedAt: new Date().toISOString(),
    };
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

const share = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

/**
 * Accounts that made a request within the last `days` days.
 *
 * `lastSeenAt` is written by the session layer, which is the only place that
 * knows someone is actually here — a meal or a bazar entry carries the date it
 * is *for*, which can be days either side of when it was typed.
 */
async function seenSince(db: Db, days: number) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return db.collection("users").countDocuments({ lastSeenAt: { $gte: cutoff } });
}

async function sumField(db: Db, collection: string, field: string) {
  const [row] = await db
    .collection(collection)
    .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: `$${field}` } } }])
    .toArray();
  return row?.total ?? 0;
}

async function entriesPerMess(db: Db, messIds: string[]) {
  if (!messIds.length) return new Map<string, number>();
  const counts = new Map<string, number>();
  const parts = await Promise.all(
    ["meals", "expenses", "bazar"].map((collection) =>
      db
        .collection(collection)
        .aggregate<{ _id: string; total: number }>([
          { $match: { messId: { $in: messIds } } },
          { $group: { _id: "$messId", total: { $sum: 1 } } },
        ])
        .toArray(),
    ),
  );
  for (const rows of parts) {
    for (const row of rows) counts.set(row._id, (counts.get(row._id) ?? 0) + row.total);
  }
  return counts;
}

/** Real sign-up history for the last twelve months, oldest first. */
async function loadSignups(db: Db) {
  const period = currentPeriod();
  const wanted = Array.from({ length: 12 }, (_, index) => shiftPeriod(period, index - 11));
  const from = `${wanted[0]}-01`;
  const group = { $substrBytes: ["$createdAt", 0, 7] };

  const [userRows, messRows] = await Promise.all([
    db
      .collection("users")
      .aggregate<{ _id: string; total: number }>([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: group, total: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection("messes")
      .aggregate<{ _id: string; total: number }>([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: group, total: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const usersBy = new Map(userRows.map((row) => [row._id, row.total]));
  const messesBy = new Map(messRows.map((row) => [row._id, row.total]));
  return wanted.map((month) => ({
    period: month,
    label: periodShortLabel(month).split(" ")[0],
    users: usersBy.get(month) ?? 0,
    messes: messesBy.get(month) ?? 0,
  }));
}
