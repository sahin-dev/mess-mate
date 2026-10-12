import "server-only";

import { performance } from "node:perf_hooks";
import type { Db, Filter } from "mongodb";
import type {
  ActivityDocument,
  AdminAuditDocument,
  AnnouncementDocument,
  ListingDocument,
  ListingReportDocument,
  MemberDocument,
  RoomDocument,
  SettlementClosureDocument,
} from "@/lib/data";
import { isDemoUser } from "@/lib/demo";
import { demoEnabled, isProduction } from "@/lib/env";
import { appUrlIsLocal, mailIsDelivered, mailTransport } from "@/lib/mail";
import { currentPeriod, periodShortLabel, shiftPeriod } from "@/lib/period";
import { PRESENCE_WINDOW_MS } from "@/lib/presence";
import { newId, type MessDocument, type UserDocument } from "@/lib/server-utils";
import type {
  AdminActivityRow,
  AdminAnnouncementRow,
  AdminAuditRow,
  AdminHealth,
  AdminHealthCheck,
  AdminListingRow,
  AdminMessDetail,
  AdminMessRow,
  AdminOverview,
  AdminPage,
  AdminReportRow,
  AdminUserDetail,
  AdminUserRole,
  AdminUserRow,
} from "@/lib/types";

export const ADMIN_PAGE_SIZE = 25;

/** Turns free text into a safe, case-insensitive "contains" pattern. */
export function searchPattern(query: string) {
  const trimmed = query.trim().slice(0, 80);
  if (!trimmed) return null;
  return new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export function pageNumber(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

const skipFor = (page: number) => (page - 1) * ADMIN_PAGE_SIZE;

/* ------------------------------------------------------------------ *
 * Audit
 * ------------------------------------------------------------------ */

export async function recordAudit(
  db: Db,
  actor: Pick<UserDocument, "id" | "name">,
  entry: Pick<AdminAuditDocument, "action" | "targetType" | "targetId" | "targetLabel" | "detail">,
) {
  await db.collection<AdminAuditDocument>("adminAudit").insertOne({
    id: newId("audit"),
    actorId: actor.id,
    actorName: actor.name,
    createdAt: new Date().toISOString(),
    ...entry,
  });
}

const toAuditRow = (row: AdminAuditDocument): AdminAuditRow => ({
  id: row.id,
  actorName: row.actorName,
  action: row.action,
  targetType: row.targetType,
  targetId: row.targetId,
  targetLabel: row.targetLabel,
  detail: row.detail,
  createdAt: row.createdAt,
});

export async function listAudit(db: Db, query: string, page: number): Promise<AdminPage<AdminAuditRow>> {
  const pattern = searchPattern(query);
  const filter: Filter<AdminAuditDocument> = pattern
    ? { $or: [{ actorName: pattern }, { targetLabel: pattern }, { action: pattern }, { detail: pattern }] }
    : {};
  const collection = db.collection<AdminAuditDocument>("adminAudit");
  const [rows, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skipFor(page)).limit(ADMIN_PAGE_SIZE).toArray(),
    collection.countDocuments(filter),
  ]);
  return { rows: rows.map(toAuditRow), total, page, pageSize: ADMIN_PAGE_SIZE };
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

type UserFilter = "All" | AdminUserRole | "Suspended";

async function activeMemberships(db: Db, userIds: string[]) {
  if (!userIds.length) return new Map<string, MemberDocument>();
  const rows = await db
    .collection<MemberDocument>("members")
    .find({ userId: { $in: userIds }, status: "active" })
    .toArray();
  return new Map(rows.map((row) => [row.userId as string, row]));
}

async function messNames(db: Db, messIds: string[]) {
  const unique = [...new Set(messIds.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const rows = await db
    .collection<MessDocument>("messes")
    .find({ id: { $in: unique } }, { projection: { id: 1, name: 1 } })
    .toArray();
  return new Map(rows.map((row) => [row.id, row.name]));
}

function toUserRow(
  account: UserDocument,
  membership: MemberDocument | undefined,
  messName: string | undefined,
  viewerId: string,
): AdminUserRow {
  const role: AdminUserRole = account.isAdmin
    ? "Admin"
    : membership
      ? membership.role === "Manager"
        ? "Manager"
        : "Member"
      : "No mess";
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role,
    messId: membership?.messId ?? null,
    messName: messName ?? null,
    joinedAt: account.createdAt,
    lastSeenAt: account.lastSeenAt ?? null,
    suspended: Boolean(account.suspendedAt),
    suspendedReason: account.suspendedReason ?? "",
    isDemo: isDemoUser(account.id),
    isSelf: account.id === viewerId,
  };
}

export async function listUsers(
  db: Db,
  viewerId: string,
  query: string,
  filterName: string,
  page: number,
): Promise<AdminPage<AdminUserRow>> {
  const pattern = searchPattern(query);
  const filter: Filter<UserDocument> = pattern ? { $or: [{ name: pattern }, { email: pattern }] } : {};
  const wanted = filterName as UserFilter;

  if (wanted === "Admin") filter.isAdmin = true;
  if (wanted === "Suspended") filter.suspendedAt = { $type: "string" };
  if (wanted === "Manager" || wanted === "Member" || wanted === "No mess") {
    const memberFilter: Filter<MemberDocument> = { status: "active", userId: { $type: "string" } };
    if (wanted !== "No mess") memberFilter.role = wanted;
    const ids = (await db.collection<MemberDocument>("members").distinct("userId", memberFilter)).filter(
      (id): id is string => typeof id === "string",
    );
    filter.isAdmin = { $ne: true };
    filter.id = wanted === "No mess" ? { $nin: ids } : { $in: ids };
  }

  const collection = db.collection<UserDocument>("users");
  const [accounts, total] = await Promise.all([
    collection
      .find(filter, { projection: { passwordHash: 0, passwordSalt: 0 } })
      .sort({ createdAt: -1 })
      .skip(skipFor(page))
      .limit(ADMIN_PAGE_SIZE)
      .toArray(),
    collection.countDocuments(filter),
  ]);
  const memberships = await activeMemberships(
    db,
    accounts.map((account) => account.id),
  );
  const names = await messNames(
    db,
    [...memberships.values()].map((membership) => membership.messId),
  );
  return {
    rows: accounts.map((account) => {
      const membership = memberships.get(account.id);
      return toUserRow(account, membership, membership ? names.get(membership.messId) : undefined, viewerId);
    }),
    total,
    page,
    pageSize: ADMIN_PAGE_SIZE,
  };
}

export async function userDetail(db: Db, viewerId: string, id: string): Promise<AdminUserDetail | null> {
  const account = await db
    .collection<UserDocument>("users")
    .findOne({ id }, { projection: { passwordHash: 0, passwordSalt: 0 } });
  if (!account) return null;
  const [memberships, sessions, listings, audit] = await Promise.all([
    db.collection<MemberDocument>("members").find({ userId: id }).sort({ joinedAt: -1 }).toArray(),
    db.collection("sessions").countDocuments({ userId: id, expiresAt: { $gt: new Date() } }),
    db.collection<ListingDocument>("listings").countDocuments({ authorId: id }),
    db.collection<AdminAuditDocument>("adminAudit").find({ targetId: id }).sort({ createdAt: -1 }).limit(10).toArray(),
  ]);
  const names = await messNames(
    db,
    memberships.map((membership) => membership.messId),
  );
  const active = memberships.find((membership) => membership.status === "active");
  return {
    ...toUserRow(account, active, active ? names.get(active.messId) : undefined, viewerId),
    phone: account.phone ?? "",
    sessions,
    listings,
    memberships: memberships.map((membership) => ({
      messId: membership.messId,
      messName: names.get(membership.messId) ?? "A deleted mess",
      role: membership.role,
      status: membership.status,
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt ?? null,
    })),
    audit: audit.map(toAuditRow),
  };
}

/* ------------------------------------------------------------------ *
 * Messes
 * ------------------------------------------------------------------ */

async function entriesPerMess(db: Db, messIds: string[]) {
  const counts = new Map<string, number>();
  if (!messIds.length) return counts;
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

async function messRows(db: Db, messes: MessDocument[]): Promise<AdminMessRow[]> {
  const ids = messes.map((mess) => mess.id);
  if (!ids.length) return [];
  const [members, entries, lastActivity] = await Promise.all([
    db
      .collection<MemberDocument>("members")
      .find({ messId: { $in: ids }, status: "active" }, { projection: { messId: 1, role: 1, name: 1, email: 1, id: 1 } })
      .toArray(),
    entriesPerMess(db, ids),
    db
      .collection<ActivityDocument>("activity")
      .aggregate<{ _id: string; at: string }>([
        { $match: { messId: { $in: ids } } },
        { $group: { _id: "$messId", at: { $max: "$createdAt" } } },
      ])
      .toArray(),
  ]);
  const lastBy = new Map(lastActivity.map((row) => [row._id, row.at]));
  return messes.map((mess) => {
    const roster = members.filter((member) => member.messId === mess.id);
    const owner =
      roster.find((member) => member.id === mess.managerId) ??
      roster.find((member) => member.role === "Manager");
    const status = mess.suspendedAt ? "Suspended" : roster.length > 0 ? "Active" : "Setup";
    return {
      id: mess.id,
      name: mess.name,
      manager: owner?.name ?? "Unassigned",
      managerEmail: owner?.email ?? "",
      members: roster.length,
      entries: entries.get(mess.id) ?? 0,
      location: mess.location,
      createdAt: mess.createdAt,
      lastActivityAt: lastBy.get(mess.id) ?? null,
      status,
      suspendedReason: mess.suspendedReason ?? "",
    };
  });
}

export async function listMesses(
  db: Db,
  query: string,
  filterName: string,
  page: number,
): Promise<AdminPage<AdminMessRow>> {
  const pattern = searchPattern(query);
  const filter: Filter<MessDocument> = pattern
    ? { $or: [{ name: pattern }, { location: pattern }, { joinCode: pattern }] }
    : {};
  if (filterName === "Suspended") filter.suspendedAt = { $type: "string" };
  if (filterName === "Active" || filterName === "Setup") {
    const withMembers = await db.collection<MemberDocument>("members").distinct("messId", { status: "active" });
    filter.suspendedAt = { $not: { $type: "string" } };
    filter.id = filterName === "Active" ? { $in: withMembers } : { $nin: withMembers };
  }
  const collection = db.collection<MessDocument>("messes");
  const [messes, total] = await Promise.all([
    collection
      .find(filter, { projection: { settings: 0, property: 0, facilities: 0 } })
      .sort({ createdAt: -1 })
      .skip(skipFor(page))
      .limit(ADMIN_PAGE_SIZE)
      .toArray(),
    collection.countDocuments(filter),
  ]);
  return { rows: await messRows(db, messes), total, page, pageSize: ADMIN_PAGE_SIZE };
}

export async function messDetail(db: Db, id: string): Promise<AdminMessDetail | null> {
  const mess = await db.collection<MessDocument>("messes").findOne({ id });
  if (!mess) return null;
  const [[row], members, rooms, closedMonths, meals, bazar, expenses, listings, activity] = await Promise.all([
    messRows(db, [mess]),
    db.collection<MemberDocument>("members").find({ messId: id }).sort({ status: 1, joinedAt: 1 }).toArray(),
    db.collection<RoomDocument>("rooms").countDocuments({ messId: id }),
    db.collection<SettlementClosureDocument>("settlementClosures").countDocuments({ messId: id, status: "closed" }),
    db.collection("meals").countDocuments({ messId: id }),
    db.collection("bazar").countDocuments({ messId: id }),
    db.collection("expenses").countDocuments({ messId: id }),
    db.collection("listings").countDocuments({ messId: id }),
    db.collection<ActivityDocument>("activity").find({ messId: id }).sort({ createdAt: -1 }).limit(15).toArray(),
  ]);
  const settings = (mess.settings ?? {}) as { timezone?: string };
  return {
    ...row,
    joinCode: mess.joinCode,
    timezone: settings.timezone ?? "Asia/Dhaka",
    rooms,
    closedMonths,
    counts: { meals, bazar, expenses, listings },
    roster: members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.name,
      email: member.email,
      role: member.id === mess.managerId ? "Owner" : member.role,
      status: member.status,
      joinedAt: member.joinedAt,
    })),
    activity: activity.map((item) => ({ ...toActivity(item), messName: mess.name })),
  };
}

/* ------------------------------------------------------------------ *
 * Listings and reports
 * ------------------------------------------------------------------ */

export async function listListings(
  db: Db,
  query: string,
  filterName: string,
  page: number,
): Promise<AdminPage<AdminListingRow>> {
  const pattern = searchPattern(query);
  const filter: Filter<ListingDocument> = pattern
    ? { $or: [{ title: pattern }, { slug: pattern }, { authorName: pattern }] }
    : {};
  if (filterName === "Published") filter.status = "published";
  if (filterName === "Pending") filter.status = "pending";
  if (filterName === "Draft") filter.status = "draft";
  if (filterName === "Removed") filter["moderation.removedAt"] = { $type: "string" };
  if (filterName === "Reported") {
    const reported = await db
      .collection<ListingReportDocument>("listingReports")
      .distinct("listingId", { status: "open" });
    filter.id = { $in: reported };
  }
  const collection = db.collection<ListingDocument>("listings");
  const [listings, total] = await Promise.all([
    collection
      .find(filter, { projection: { photos: 0, rules: 0, description: 0 } })
      .sort({ updatedAt: -1 })
      .skip(skipFor(page))
      .limit(ADMIN_PAGE_SIZE)
      .toArray(),
    collection.countDocuments(filter),
  ]);
  const ids = listings.map((listing) => listing.id);
  const [names, rooms, reports] = await Promise.all([
    messNames(
      db,
      listings.map((listing) => listing.messId),
    ),
    db
      .collection<RoomDocument>("rooms")
      .find({ id: { $in: listings.map((listing) => listing.roomId) } }, { projection: { id: 1, name: 1 } })
      .toArray(),
    db
      .collection<ListingReportDocument>("listingReports")
      .aggregate<{ _id: string; total: number }>([
        { $match: { listingId: { $in: ids }, status: "open" } },
        { $group: { _id: "$listingId", total: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
  const reportCounts = new Map(reports.map((row) => [row._id, row.total]));
  return {
    rows: listings.map((listing) => ({
      id: listing.id,
      slug: listing.slug,
      title: listing.title || "Untitled post",
      roomName: roomNames.get(listing.roomId) ?? "A removed room",
      messId: listing.messId,
      messName: names.get(listing.messId) ?? "A deleted mess",
      status: listing.status,
      authorName: listing.authorName ?? "",
      publishedAt: listing.publishedAt ?? null,
      updatedAt: listing.updatedAt,
      openReports: reportCounts.get(listing.id) ?? 0,
      removedByAdmin: Boolean(listing.moderation?.removedAt),
      removalReason: listing.moderation?.reason ?? "",
    })),
    total,
    page,
    pageSize: ADMIN_PAGE_SIZE,
  };
}

export async function listReports(
  db: Db,
  filterName: string,
  page: number,
): Promise<AdminPage<AdminReportRow>> {
  const status = filterName === "Actioned" ? "actioned" : filterName === "Dismissed" ? "dismissed" : filterName === "All" ? null : "open";
  const filter: Filter<ListingReportDocument> = status ? { status } : {};
  const collection = db.collection<ListingReportDocument>("listingReports");
  const [reports, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(skipFor(page)).limit(ADMIN_PAGE_SIZE).toArray(),
    collection.countDocuments(filter),
  ]);
  const listings = await db
    .collection<ListingDocument>("listings")
    .find(
      { id: { $in: reports.map((report) => report.listingId) } },
      { projection: { id: 1, title: 1, slug: 1, messId: 1 } },
    )
    .toArray();
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const names = await messNames(
    db,
    reports.map((report) => report.messId),
  );
  return {
    rows: reports.map((report) => {
      const listing = byId.get(report.listingId);
      return {
        id: report.id,
        listingId: report.listingId,
        listingTitle: listing?.title || (listing ? "Untitled post" : "A deleted post"),
        slug: listing?.slug ?? "",
        messName: names.get(report.messId) ?? "A deleted mess",
        reason: report.reason,
        details: report.details,
        contact: report.contact,
        status: report.status,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt,
        resolvedBy: report.resolvedBy,
      };
    }),
    total,
    page,
    pageSize: ADMIN_PAGE_SIZE,
  };
}

/* ------------------------------------------------------------------ *
 * Activity and announcements
 * ------------------------------------------------------------------ */

const toActivity = (item: ActivityDocument) => ({
  id: item.id,
  messId: item.messId,
  title: item.title,
  detail: item.detail,
  createdAt: item.createdAt,
  tone: item.tone,
});

export async function listActivity(
  db: Db,
  query: string,
  page: number,
  limit = ADMIN_PAGE_SIZE,
): Promise<AdminPage<AdminActivityRow>> {
  const pattern = searchPattern(query);
  const filter: Filter<ActivityDocument> = pattern ? { $or: [{ title: pattern }, { detail: pattern }] } : {};
  const collection = db.collection<ActivityDocument>("activity");
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);
  const names = await messNames(
    db,
    items.map((item) => item.messId),
  );
  return {
    rows: items.map((item) => ({ ...toActivity(item), messName: names.get(item.messId) ?? "A deleted mess" })),
    total,
    page,
    pageSize: limit,
  };
}

export function announcementState(row: Pick<AnnouncementDocument, "startsAt" | "endsAt">, now = new Date().toISOString()) {
  if (row.startsAt > now) return "scheduled" as const;
  if (row.endsAt && row.endsAt <= now) return "ended" as const;
  return "running" as const;
}

export async function listAnnouncements(db: Db): Promise<AdminAnnouncementRow[]> {
  const rows = await db
    .collection<AnnouncementDocument>("announcements")
    .find({})
    .sort({ startsAt: -1 })
    .limit(100)
    .toArray();
  const now = new Date().toISOString();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    tone: row.tone,
    audience: row.audience,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    state: announcementState(row, now),
  }));
}

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

async function pingDatabase(db: Db) {
  const started = performance.now();
  await db.command({ ping: 1 });
  return Math.max(1, Math.round(performance.now() - started));
}

/** Configuration that decides whether this deployment is safe to run in public. */
export function configurationChecks(latencyMs: number): AdminHealthCheck[] {
  const production = isProduction();
  const transport = mailTransport();
  const checks: AdminHealthCheck[] = [
    {
      id: "database",
      label: "Database",
      status: latencyMs > 500 ? "warn" : "ok",
      detail:
        latencyMs > 500
          ? `Connected, but a ${latencyMs} ms ping is slow. Check the cluster region and tier.`
          : `Connected · ${latencyMs} ms ping`,
    },
    {
      id: "email",
      label: "Email delivery",
      status: mailIsDelivered() ? "ok" : production ? "error" : "warn",
      detail: mailIsDelivered()
        ? `Sending through ${transport === "resend" ? "Resend" : "SMTP"}`
        : transport === "console"
          ? "Printed to the server log only. Set RESEND_API_KEY or SMTP_HOST to deliver invitations and resets."
          : "Disabled. Invitations, password resets and reminders are not being delivered.",
    },
    {
      id: "app-url",
      label: "Public address for links",
      status: appUrlIsLocal() ? (production ? "error" : "warn") : "ok",
      detail: appUrlIsLocal()
        ? "MESSMATE_APP_URL is not set, so links in emails point at localhost."
        : (process.env.MESSMATE_APP_URL ?? "").trim(),
    },
    {
      id: "cron",
      label: "Scheduled reminders",
      status: process.env.MESSMATE_CRON_SECRET?.trim() ? "ok" : production ? "error" : "warn",
      detail: process.env.MESSMATE_CRON_SECRET?.trim()
        ? "Protected by MESSMATE_CRON_SECRET. Point an hourly scheduler at /api/cron/notifications."
        : production
          ? "MESSMATE_CRON_SECRET is not set, so the reminder endpoint refuses every call."
          : "MESSMATE_CRON_SECRET is not set. The endpoint is open on this development machine only.",
    },
    {
      id: "demo",
      label: "Demo sign-in",
      status: demoEnabled() ? (production ? "error" : "ok") : "ok",
      detail: demoEnabled()
        ? production
          ? "Enabled in production. Anyone can sign in as a platform administrator. Unset MESSMATE_ENABLE_DEMO."
          : "Enabled (development only)."
        : "Disabled.",
    },
    {
      id: "rate-limit",
      label: "Rate limiting",
      status: "ok",
      detail: "In process memory. Move to a shared store before running more than one instance.",
    },
  ];
  return checks;
}

const COUNTED_COLLECTIONS = [
  "users",
  "sessions",
  "messes",
  "members",
  "meals",
  "bazar",
  "expenses",
  "listings",
  "listingPhotos",
  "listingReports",
  "activity",
  "adminAudit",
];

export async function loadHealth(db: Db): Promise<AdminHealth> {
  const latencyMs = await pingDatabase(db);
  const [stats, counts] = await Promise.all([
    db.stats().catch(() => null) as Promise<{ dataSize?: number; storageSize?: number } | null>,
    Promise.all(
      COUNTED_COLLECTIONS.map(async (name) => ({
        name,
        documents: await db.collection(name).estimatedDocumentCount().catch(() => 0),
      })),
    ),
  ]);
  return {
    checks: configurationChecks(latencyMs),
    database: {
      latencyMs,
      name: db.databaseName,
      dataSizeBytes: typeof stats?.dataSize === "number" ? stats.dataSize : null,
      storageSizeBytes: typeof stats?.storageSize === "number" ? stats.storageSize : null,
      collections: counts,
    },
    runtime: {
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      environment: isProduction() ? "production" : "development",
    },
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Overview
 * ------------------------------------------------------------------ */

const share = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

async function sumField(db: Db, collection: string, field: string) {
  const [row] = await db
    .collection(collection)
    .aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: `$${field}` } } }])
    .toArray();
  return row?.total ?? 0;
}

/**
 * Accounts that made a request within the last `days` days. `lastSeenAt` is
 * written by the session layer, which is the only place that knows someone is
 * actually here — a meal carries the date it is *for*.
 */
async function seenSince(db: Db, sinceMs: number) {
  const cutoff = new Date(Date.now() - sinceMs).toISOString();
  return db.collection("users").countDocuments({ lastSeenAt: { $gte: cutoff } });
}

/** Real sign-up history for the last twelve months, oldest first. */
async function loadSignups(db: Db) {
  const period = currentPeriod();
  const wanted = Array.from({ length: 12 }, (_, index) => shiftPeriod(period, index - 11));
  const from = `${wanted[0]}-01`;
  const group = { $substrBytes: ["$createdAt", 0, 7] };
  const [userRows, messRowsByMonth] = await Promise.all(
    ["users", "messes"].map((collection) =>
      db
        .collection(collection)
        .aggregate<{ _id: string; total: number }>([
          { $match: { createdAt: { $gte: from } } },
          { $group: { _id: group, total: { $sum: 1 } } },
        ])
        .toArray(),
    ),
  );
  const usersBy = new Map(userRows.map((row) => [row._id, row.total]));
  const messesBy = new Map(messRowsByMonth.map((row) => [row._id, row.total]));
  return wanted.map((month) => ({
    period: month,
    label: periodShortLabel(month).split(" ")[0],
    users: usersBy.get(month) ?? 0,
    messes: messesBy.get(month) ?? 0,
  }));
}

export async function loadOverview(db: Db): Promise<AdminOverview> {
  const latencyMs = await pingDatabase(db);
  const now = new Date().toISOString();
  const day = 86_400_000;
  const [
    users,
    messes,
    meals,
    bazar,
    rooms,
    expenseVolume,
    activeMessIds,
    publishedListings,
    onlineNow,
    activeDay,
    activeWeek,
    activeMonth,
    everSeen,
    openReports,
    suspendedUsers,
    suspendedMesses,
    runningAnnouncements,
    signups,
    recent,
    activity,
  ] = await Promise.all([
    db.collection("users").countDocuments(),
    db.collection("messes").countDocuments(),
    db.collection("meals").countDocuments(),
    db.collection("bazar").countDocuments(),
    db.collection("rooms").countDocuments(),
    sumField(db, "expenses", "amount"),
    db.collection<MemberDocument>("members").distinct("messId", { status: "active" }),
    db.collection("listings").countDocuments({ status: "published" }),
    seenSince(db, PRESENCE_WINDOW_MS),
    seenSince(db, day),
    seenSince(db, 7 * day),
    seenSince(db, 30 * day),
    db.collection("users").countDocuments({ lastSeenAt: { $exists: true } }),
    db.collection("listingReports").countDocuments({ status: "open" }),
    db.collection("users").countDocuments({ suspendedAt: { $type: "string" } }),
    db.collection("messes").countDocuments({ suspendedAt: { $type: "string" } }),
    db.collection("announcements").countDocuments({
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    }),
    loadSignups(db),
    db
      .collection<MessDocument>("messes")
      .find({}, { projection: { settings: 0, property: 0, facilities: 0 } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
    listActivity(db, "", 1, 8),
  ]);
  const totalRecords = meals + bazar + rooms;
  return {
    stats: {
      users,
      messes,
      meals,
      expenseVolume,
      bazar,
      rooms,
      activeMesses: activeMessIds.length,
      publishedListings,
      onlineNow,
      activeDay,
      activeWeek,
      activeMonth,
      activityPartial: everSeen < users,
    },
    queue: { openReports, suspendedUsers, suspendedMesses, runningAnnouncements },
    signups,
    featureUsage: [
      { label: "Meal entries", count: meals, share: share(meals, totalRecords) },
      { label: "Bazar entries", count: bazar, share: share(bazar, totalRecords) },
      { label: "Rooms configured", count: rooms, share: share(rooms, totalRecords) },
      { label: "Messes with members", count: activeMessIds.length, share: share(activeMessIds.length, messes) },
    ],
    recentMesses: await messRows(db, recent),
    activity: activity.rows,
    warnings: configurationChecks(latencyMs).filter((check) => check.status !== "ok"),
    databaseLatency: latencyMs,
    generatedAt: new Date().toISOString(),
  };
}
