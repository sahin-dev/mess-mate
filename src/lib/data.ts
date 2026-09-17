import type { Db } from "mongodb";
import { periodShortLabel, shiftPeriod, type Period } from "@/lib/period";
import { DEFAULT_TIMEZONE, normalizeTimezone, periodInZone, todayInZone } from "@/lib/timezone";
import { mailIsDelivered } from "@/lib/mail";
import { buildRoster, computeSettlement } from "@/lib/settlement";
import type {
  ActivityItem,
  BazarEntry,
  Expense,
  Facility,
  Listing,
  MessProperty,
  MealEntry,
  Member,
  MessSettings,
  ProfileVisibility,
  Room,
  TrendPoint,
  UserRole,
  WorkspaceData,
} from "@/lib/types";
import { mergeFacilities, mergeProperty, mergeRoom } from "@/lib/property";
import { mergeListing } from "@/lib/listing-post";
import { DEMO_ADMIN_ID, DEMO_MANAGER_ID, DEMO_MESS_ID } from "@/lib/demo";
import { canSee, mergeVisibility } from "@/lib/visibility";
import {
  hashPassword,
  newId,
  type MessDocument,
  type UserDocument,
  workspaceFor,
} from "@/lib/server-utils";

export type MemberDocument = {
  id: string;
  messId: string;
  userId: string | null;
  name: string;
  email: string;
  role: Member["role"];
  roomId: string | null;
  status: Member["status"];
  joinedAt: string;
  color: string;
};
/** Rooms created before the house fields existed simply lack them. */
type RoomExtras = "attachedBathroom" | "balcony" | "airConditioned" | "furnishing" | "notes";
export type RoomDocument = Omit<Room, RoomExtras> &
  Partial<Pick<Room, RoomExtras>> & { messId: string };
export type ListingDocument = Omit<Listing, "roomName"> & { messId: string; createdAt: string };
/**
 * Photo bytes live in their own collection rather than inside the listing, so
 * loading the community index never drags megabytes of base64 with it.
 */
export type ListingPhotoDocument = {
  id: string;
  messId: string;
  listingId: string;
  type: string;
  /** Base64, without the data: prefix. */
  data: string;
  bytes: number;
  width: number;
  height: number;
  createdAt: string;
};
/**
 * A profile picture. Stored like a listing photo — base64 in Mongo — because
 * the app has no object store, and an avatar is a few tens of kilobytes after
 * the browser has squared it off.
 */
export type AvatarDocument = {
  id: string;
  userId: string;
  type: string;
  /** Base64, without the data: prefix. */
  data: string;
  bytes: number;
  createdAt: string;
};
export type MealDocument = MealEntry & { messId: string; userId: string };
/** `createdBy` is the member who actually paid, which is what the settlement needs. */
export type ExpenseDocument = Omit<Expense, "paidBy" | "paidById"> & {
  messId: string;
  createdBy: string;
  createdAt: string;
};
export type BazarDocument = Omit<BazarEntry, "hasProof"> & {
  messId: string;
  createdAt: string;
  proof?: { name: string; type: string; data: string };
};
export type ActivityDocument = ActivityItem & { messId: string };

export const MEMBER_COLORS = [
  "#c9603f",
  "#3f6b80",
  "#6a66a0",
  "#a97c31",
  "#33765f",
  "#8a5570",
  "#4a7a4a",
  "#7a6448",
];

export const defaultSettings: MessSettings = {
  mealTypes: { breakfast: true, lunch: true, dinner: true },
  allowAnytime: false,
  cutoff: "22:30",
  timezone: DEFAULT_TIMEZONE,
  mealApproval: false,
  bazarApproval: true,
  requireProof: false,
  rosterFrequency: "alternate",
  notifications: { cutoff: true, roster: true, settlement: false },
  fixedExpenses: [
    { id: "fixed_wifi", title: "Wi-Fi", amount: 1200 },
    { id: "fixed_cleaner", title: "Cleaner", amount: 2500 },
    { id: "fixed_gas", title: "Gas", amount: 1080 },
  ],
};

export async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ id: 1 }, { unique: true }),
    // The admin dashboard counts accounts seen inside a window.
    db.collection("users").createIndex({ lastSeenAt: -1 }),
    db.collection("sessions").createIndex({ token: 1 }, { unique: true }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("messes").createIndex({ joinCode: 1 }, { unique: true }),
    db.collection("messes").createIndex({ id: 1 }, { unique: true }),
    db.collection("members").createIndex({ messId: 1, email: 1 }, { unique: true }),
    db.collection("members").createIndex({ userId: 1, status: 1 }),
    db.collection("meals").createIndex({ messId: 1, userId: 1, date: 1 }, { unique: true }),
    db.collection("meals").createIndex({ messId: 1, date: 1 }),
    db.collection("expenses").createIndex({ messId: 1, date: -1 }),
    db.collection("bazar").createIndex({ messId: 1, date: -1 }),
    db.collection("activity").createIndex({ messId: 1, createdAt: -1 }),
    db.collection("rooms").createIndex({ messId: 1 }),
    db.collection("listings").createIndex({ slug: 1 }, { unique: true }),
    db.collection("listings").createIndex({ messId: 1 }),
    // The community index page lists published rooms, newest first.
    db.collection("listings").createIndex({ status: 1, publishedAt: -1 }),
    // Photos are fetched one at a time by the serving route, and purged in
    // bulk when a post is deleted.
    db.collection("listingPhotos").createIndex({ id: 1 }, { unique: true }),
    db.collection("listingPhotos").createIndex({ listingId: 1 }),
    // Avatars are fetched by id when serving, and by user when replacing one.
    db.collection("avatars").createIndex({ id: 1 }, { unique: true }),
    db.collection("avatars").createIndex({ userId: 1 }),
  ]);
}

/** Matches an `YYYY-MM-DD` date field against one `YYYY-MM` period. */
const inPeriod = (period: Period) => ({ $gte: `${period}-01`, $lte: `${period}-31` });

export async function getWorkspaceData(
  db: Db,
  user: UserDocument,
  messId: string,
  role: UserRole,
  requestedPeriod?: Period,
): Promise<WorkspaceData> {
  const mess = await db.collection<MessDocument>("messes").findOne({ id: messId });
  const settings: MessSettings = { ...defaultSettings, ...(mess?.settings as Partial<MessSettings>) };
  settings.timezone = normalizeTimezone(settings.timezone);
  const period = requestedPeriod ?? periodInZone(settings.timezone);
  const workspace = await workspaceFor(db, user, messId, role);

  const [memberDocs, rooms, periodMeals, expenses, bazar, activity, trend, periods, listings] =
    await Promise.all([
      db.collection<MemberDocument>("members").find({ messId }).sort({ joinedAt: 1 }).toArray(),
      db.collection<RoomDocument>("rooms").find({ messId }).sort({ name: 1 }).toArray(),
      db
        .collection<MealDocument>("meals")
        .find({ messId, date: inPeriod(period) })
        .sort({ date: 1 })
        .toArray(),
      db
        .collection<ExpenseDocument>("expenses")
        .find({ messId, date: inPeriod(period) })
        .sort({ date: -1 })
        .toArray(),
      db
        .collection<BazarDocument>("bazar")
        .find({ messId, date: inPeriod(period) })
        .sort({ date: -1 })
        .toArray(),
      db
        .collection<ActivityDocument>("activity")
        .find({ messId })
        .sort({ createdAt: -1 })
        .limit(25)
        .toArray(),
      loadTrend(db, messId, period),
      loadPeriods(db, messId, period, settings.timezone),
      db.collection<ListingDocument>("listings").find({ messId }).sort({ updatedAt: -1 }).toArray(),
    ]);

  // A member row belongs to the mess; the phone number and picture belong to
  // the person's own account, so they are read back through `userId`. An
  // invited member has no account yet and simply has neither.
  const linkedUserIds = memberDocs.map((member) => member.userId).filter((id): id is string => Boolean(id));
  const profiles = linkedUserIds.length
    ? await db
        .collection<UserDocument>("users")
        .find({ id: { $in: linkedUserIds } })
        .project<{
          id: string;
          phone?: string;
          avatarId?: string | null;
          visibility?: Partial<ProfileVisibility>;
        }>({ id: 1, phone: 1, avatarId: 1, visibility: 1 })
        .toArray()
    : [];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const roomNames = new Map(rooms.map((room) => [room.id, room.name]));
  const memberNames = new Map(memberDocs.map((member) => [member.id, member.name]));
  const isManager = role === "manager" || role === "admin";
  const property = mergeProperty(mess?.property as Partial<MessProperty> | undefined, mess?.location ?? "");
  const facilities = mergeFacilities(mess?.facilities as Facility[] | undefined);

  const settlement = computeSettlement({
    period,
    members: memberDocs,
    rooms,
    meals: periodMeals,
    bazar,
    expenses: expenses.map((expense) => ({ ...expense, paidById: expense.createdBy })),
  });
  const positions = new Map(settlement.members.map((entry) => [entry.memberId, entry]));

  const members: Member[] = memberDocs.map((member) => {
    const position = positions.get(member.id);
    const profile = member.userId ? profileById.get(member.userId) : undefined;
    // Everyone in this list shares the viewer's mess, so "mess" always passes;
    // what is actually being decided here is "private". A member who has not
    // signed up yet has no account to carry a choice, and their address is the
    // one the manager typed into the invitation, so it stays visible.
    const seen = { isSelf: member.userId === user.id, inMess: true, isManager };
    const level = mergeVisibility(profile?.visibility);
    const showContact = (field: "email" | "phone") =>
      !profile || canSee(level[field], seen);
    return {
      id: member.id,
      name: member.name,
      email: showContact("email") ? member.email : "",
      phone: showContact("phone") ? (profile?.phone ?? "") : "",
      // A picture is not a contact detail, so a manager gets no exemption.
      avatarId: canSee(level.avatar, { ...seen, isManager: false })
        ? (profile?.avatarId ?? null)
        : null,
      role: member.role,
      roomId: member.roomId,
      status: member.status,
      joinedAt: member.joinedAt,
      color: member.color,
      room: member.roomId ? (roomNames.get(member.roomId) ?? "Unassigned") : "Unassigned",
      meals: position?.meals ?? 0,
      mealCost: position?.mealCost ?? 0,
      expenseShare: position?.expenseShare ?? 0,
      paid: position?.paid ?? 0,
      balance: position?.balance ?? 0,
    };
  });

  return {
    workspace,
    emailEnabled: mailIsDelivered(),
    period,
    periods,
    members,
    property,
    facilities,
    listings: listings.map((listing) =>
      mergeListing({
        ...stripDocument(listing),
        roomName: roomNames.get(listing.roomId) ?? "A removed room",
      }),
    ),
    rooms: rooms.map((room) =>
      mergeRoom({
        id: room.id,
        name: room.name,
        type: room.type,
        rent: room.rent,
        capacity: room.capacity,
        accent: room.accent,
        attachedBathroom: room.attachedBathroom,
        balcony: room.balcony,
        airConditioned: room.airConditioned,
        furnishing: room.furnishing,
        notes: room.notes,
      }),
    ),
    meals: periodMeals.filter((meal) => meal.userId === user.id).map(toMealEntry),
    memberMeals: isManager
      ? Object.fromEntries(
          memberDocs.map((member) => [
            member.id,
            periodMeals.filter((meal) => meal.userId === member.id).map(toMealEntry),
          ]),
        )
      : { [user.id]: periodMeals.filter((meal) => meal.userId === user.id).map(toMealEntry) },
    expenses: expenses.map((expense) => ({
      id: expense.id,
      title: expense.title,
      category: expense.category,
      date: expense.date,
      amount: expense.amount,
      // Older records used a third "Selected members" option that never stored
      // a member list; those settle as an equal split, so read them that way.
      splitMethod: expense.splitMethod === "By room" ? "By room" : "All members equally",
      paidById: expense.createdBy,
      paidBy: memberNames.get(expense.createdBy) ?? "A former member",
    })),
    bazar: bazar.map((entry) => ({
      id: entry.id,
      by: entry.by,
      memberId: entry.memberId,
      date: entry.date,
      items: entry.items,
      amount: entry.amount,
      status: entry.status,
      proofName: entry.proofName,
      hasProof: Boolean(entry.proof?.data),
    })),
    settings,
    activity: activity.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      createdAt: item.createdAt,
      tone: item.tone,
    })),
    settlement,
    trend,
    roster: buildRoster(
      memberDocs.map((member) => ({
        ...member,
        avatarId: member.userId ? (profileById.get(member.userId)?.avatarId ?? null) : null,
      })),
      settings.rosterFrequency,
      settings.timezone,
    ),
  };
}

const toMealEntry = (meal: MealDocument): MealEntry => ({
  id: meal.id,
  date: meal.date,
  breakfast: meal.breakfast,
  lunch: meal.lunch,
  dinner: meal.dinner,
  status: meal.status,
});

/** Drops Mongo's `_id` and our `messId` before a document reaches the client. */
function stripDocument<T extends { messId: string }>(document: T) {
  const { messId: _messId, ...rest } = document as T & { _id?: unknown };
  delete (rest as { _id?: unknown })._id;
  return rest as Omit<T, "messId">;
}

/** The last twelve months of real meal-rate history, oldest first. */
async function loadTrend(db: Db, messId: string, period: Period): Promise<TrendPoint[]> {
  const wanted = Array.from({ length: 12 }, (_, index) => shiftPeriod(period, index - 11));
  const from = `${wanted[0]}-01`;
  const to = `${period}-31`;
  const group = { $substrBytes: ["$date", 0, 7] };

  const [meals, bazar] = await Promise.all([
    db
      .collection<MealDocument>("meals")
      .aggregate<{ _id: string; total: number }>([
        { $match: { messId, date: { $gte: from, $lte: to } } },
        { $group: { _id: group, total: { $sum: { $add: ["$breakfast", "$lunch", "$dinner"] } } } },
      ])
      .toArray(),
    db
      .collection<BazarDocument>("bazar")
      .aggregate<{ _id: string; total: number }>([
        { $match: { messId, status: "Approved", date: { $gte: from, $lte: to } } },
        { $group: { _id: group, total: { $sum: "$amount" } } },
      ])
      .toArray(),
  ]);

  const mealsBy = new Map(meals.map((row) => [row._id, row.total]));
  const bazarBy = new Map(bazar.map((row) => [row._id, row.total]));
  return wanted.map((month) => {
    const mealCount = mealsBy.get(month) ?? 0;
    const bazarTotal = bazarBy.get(month) ?? 0;
    return {
      period: month,
      label: periodShortLabel(month).split(" ")[0],
      meals: mealCount,
      bazar: bazarTotal,
      mealRate: mealCount > 0 ? Math.round((bazarTotal / mealCount) * 100) / 100 : 0,
    };
  });
}

/** Months that actually contain data, newest first, always including the current one. */
async function loadPeriods(
  db: Db,
  messId: string,
  period: Period,
  timeZone: string,
): Promise<Period[]> {
  const [mealMonths, expenseMonths, bazarMonths] = await Promise.all([
    db.collection("meals").distinct("date", { messId }),
    db.collection("expenses").distinct("date", { messId }),
    db.collection("bazar").distinct("date", { messId }),
  ]);
  const months = new Set<Period>([periodInZone(timeZone), period]);
  for (const list of [mealMonths, expenseMonths, bazarMonths]) {
    for (const date of list) {
      if (typeof date === "string" && date.length >= 7) months.add(date.slice(0, 7));
    }
  }
  return [...months].sort().reverse().slice(0, 24);
}

export async function addActivity(
  db: Db,
  messId: string,
  title: string,
  detail: string,
  tone: ActivityItem["tone"] = "blue",
) {
  const item: ActivityDocument = {
    id: newId("activity"),
    messId,
    title,
    detail,
    tone,
    createdAt: new Date().toISOString(),
  };
  await db.collection<ActivityDocument>("activity").insertOne(item);
}

/* ------------------------------------------------------------------ *
 * Demo workspace
 * ------------------------------------------------------------------ */

const demoMessId = DEMO_MESS_ID;
const managerId = DEMO_MANAGER_ID;
const adminId = DEMO_ADMIN_ID;

const demoProperty: MessProperty = {
  addressLine: "27/A Shukrabad",
  area: "Dhanmondi",
  city: "Dhaka",
  postcode: "1207",
  floor: "4th",
  flatNumber: "4B",
  hasLift: true,
  parking: {
    available: true,
    type: "motorbike",
    spots: 3,
    monthlyCost: 500,
    procedure: "Speak to the caretaker on the ground floor and pay the society office by the 5th.",
  },
  coordinates: { lat: 23.7509, lng: 90.3776 },
  notes: "Corner building opposite the pharmacy. The main gate closes at midnight.",
};

const demoFacilities: Facility[] = [
  { id: "fridge", label: "Fridge", available: true, detail: "Large, shared" },
  { id: "water_filter", label: "Water filter", available: true, detail: "Pureit, serviced every 3 months" },
  { id: "gas", label: "Cooking gas", available: true, detail: "Titas line" },
  { id: "wifi", label: "Wi-Fi", available: true, detail: "40 Mbps" },
  { id: "washing_machine", label: "Washing machine", available: true, detail: "" },
  { id: "geyser", label: "Hot water / geyser", available: true, detail: "In both bathrooms" },
  { id: "generator", label: "Generator or IPS", available: true, detail: "Runs fans and lights" },
  { id: "cleaner", label: "Cleaner", available: true, detail: "Every morning except Friday" },
  { id: "rooftop", label: "Rooftop access", available: true, detail: "" },
];

const demoMembers = [
  { id: managerId, name: "Rafi Islam", email: "manager@messmate.local", role: "Manager" as const, roomId: "room_a" },
  { id: "member_nayeem", name: "Nayeem Hasan", email: "nayeem@messmate.local", role: "Member" as const, roomId: "room_a" },
  { id: "member_ayon", name: "Ayon Dey", email: "ayon@messmate.local", role: "Member" as const, roomId: "room_b" },
  { id: "member_tahmid", name: "Tahmid Noor", email: "tahmid@messmate.local", role: "Member" as const, roomId: "room_c" },
  { id: "member_samiul", name: "Samiul Khan", email: "samiul@messmate.local", role: "Member" as const, roomId: "room_c" },
];

/** A small deterministic hash, so the demo looks varied but never changes between runs. */
function seeded(key: string, max: number) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % max;
}

export async function ensureDemoData(db: Db) {
  await ensureIndexes(db);
  const [managerPassword, adminPassword] = await Promise.all([
    hashPassword("demo12345", "messmate-manager-demo"),
    hashPassword("admin12345", "messmate-admin-demo"),
  ]);
  const createdAt = new Date().toISOString();
  const today = todayInZone(DEFAULT_TIMEZONE);
  const period = periodInZone(DEFAULT_TIMEZONE);
  const dayOfMonth = Number(today.slice(8, 10));
  const day = (index: number) => `${period}-${String(index).padStart(2, "0")}`;

  await db.collection<UserDocument>("users").updateOne(
    { id: managerId },
    {
      $setOnInsert: {
        id: managerId,
        name: "Rafi Islam",
        email: "manager@messmate.local",
        passwordHash: managerPassword.hash,
        passwordSalt: managerPassword.salt,
        isAdmin: false,
        createdAt,
      },
    },
    { upsert: true },
  );
  await db.collection<UserDocument>("users").updateOne(
    { id: adminId },
    {
      $setOnInsert: {
        id: adminId,
        name: "Nadia Ahmed",
        email: "admin@messmate.local",
        passwordHash: adminPassword.hash,
        passwordSalt: adminPassword.salt,
        isAdmin: true,
        createdAt,
      },
    },
    { upsert: true },
  );
  await db.collection<MessDocument>("messes").updateOne(
    { id: demoMessId },
    {
      $setOnInsert: {
        id: demoMessId,
        name: "Shapla House",
        location: "Dhanmondi, Dhaka",
        joinCode: "SHAPLA-7K4M",
        expectedMembers: 5,
        managerId,
        createdAt,
        settings: defaultSettings,
        property: demoProperty,
        facilities: demoFacilities,
      },
    },
    { upsert: true },
  );

  // Backfill the house details onto a demo mess created before they existed,
  // without overwriting anything someone has since edited in the demo.
  const demoMess = await db.collection<MessDocument>("messes").findOne({ id: demoMessId });
  if (demoMess && !demoMess.property) {
    await db.collection<MessDocument>("messes").updateOne(
      { id: demoMessId },
      { $set: { property: demoProperty, facilities: demoFacilities } },
    );
  }

  const members: MemberDocument[] = demoMembers.map((member, index) => ({
    id: member.id,
    messId: demoMessId,
    userId: member.id === managerId ? managerId : null,
    name: member.name,
    email: member.email,
    role: member.role,
    roomId: member.roomId,
    status: "active",
    joinedAt: `${shiftPeriod(period, -1)}-1${index % 5}`,
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
  }));
  const rooms: RoomDocument[] = [
    { id: "room_a", messId: demoMessId, name: "Room A", type: "Master room", rent: 9000, capacity: 2, accent: "coral", attachedBathroom: true, balcony: true, airConditioned: true, furnishing: "furnished", notes: "14 x 12 ft, south facing" },
    { id: "room_b", messId: demoMessId, name: "Room B", type: "Single room", rent: 6500, capacity: 1, accent: "blue", attachedBathroom: true, balcony: false, airConditioned: false, furnishing: "partly", notes: "Bed and desk provided" },
    { id: "room_c", messId: demoMessId, name: "Room C", type: "Shared room", rent: 8000, capacity: 2, accent: "green", attachedBathroom: false, balcony: true, airConditioned: false, furnishing: "partly", notes: "" },
    { id: "room_d", messId: demoMessId, name: "Room D", type: "Small room", rent: 5500, capacity: 1, accent: "gold", attachedBathroom: false, balcony: false, airConditioned: false, furnishing: "unfurnished", notes: "" },
  ];

  // Everything below is keyed to the current month, so opening the demo in a
  // new month tops it up instead of showing an empty workspace.
  const expenses: ExpenseDocument[] = (
    [
      { id: `expense_rent_${period}`, title: "House rent", category: "Fixed", date: day(1), amount: 29000, splitMethod: "By room" },
      { id: `expense_electricity_${period}`, title: "Electricity bill", category: "Utility", date: day(Math.min(12, dayOfMonth)), amount: 2460, splitMethod: "All members equally" },
      { id: `expense_wifi_${period}`, title: "Wi-Fi", category: "Fixed", date: day(Math.min(5, dayOfMonth)), amount: 1200, splitMethod: "All members equally" },
      { id: `expense_filter_${period}`, title: "Water filter service", category: "Maintenance", date: day(Math.min(9, dayOfMonth)), amount: 850, splitMethod: "All members equally" },
      { id: `expense_cleaner_${period}`, title: "Cleaner", category: "Fixed", date: day(Math.min(3, dayOfMonth)), amount: 2500, splitMethod: "All members equally" },
    ] as const
  ).map((expense) => ({ ...expense, messId: demoMessId, createdBy: managerId, createdAt }));

  const bazarBaskets = [
    [{ name: "Rice", quantity: "5 kg" }, { name: "Soybean oil", quantity: "2 L" }, { name: "Mixed vegetables", quantity: "3 kg" }],
    [{ name: "Chicken", quantity: "3 kg" }, { name: "Eggs", quantity: "24 pcs" }, { name: "Spices", quantity: "assorted" }],
    [{ name: "Rui fish", quantity: "3 kg" }, { name: "Lentils", quantity: "2 kg" }, { name: "Onions", quantity: "2 kg" }],
    [{ name: "Potatoes", quantity: "5 kg" }, { name: "Tomatoes", quantity: "2 kg" }, { name: "Green chilli", quantity: "500 g" }],
  ];
  const bazar: BazarDocument[] = [];
  for (let dayIndex = 2; dayIndex <= dayOfMonth; dayIndex += 3) {
    const date = day(dayIndex);
    const member = demoMembers[seeded(`buyer-${date}`, demoMembers.length)];
    const isLatest = dayIndex + 3 > dayOfMonth;
    bazar.push({
      id: `bazar_demo_${date}`,
      messId: demoMessId,
      memberId: member.id,
      by: member.name,
      date,
      items: bazarBaskets[seeded(`basket-${date}`, bazarBaskets.length)],
      amount: 900 + seeded(`amount-${date}`, 14) * 100,
      status: isLatest ? "Pending" : "Approved",
      createdAt,
    });
  }

  const meals: MealDocument[] = [];
  for (let dayIndex = 1; dayIndex <= dayOfMonth; dayIndex += 1) {
    const date = day(dayIndex);
    for (const member of demoMembers) {
      const roll = seeded(`${member.id}-${date}`, 12);
      meals.push({
        id: `meal_demo_${member.id}_${date}`,
        messId: demoMessId,
        userId: member.id,
        date,
        breakfast: roll % 4 === 0 ? 0 : 1,
        lunch: roll % 7 === 0 ? 0 : 1,
        dinner: roll % 5 === 0 ? 2 : 1,
        status: "Open",
      });
    }
  }

  const activities: ActivityDocument[] = [
    { id: `activity_demo_bazar_${period}`, messId: demoMessId, title: "Bazar awaiting approval", detail: "A grocery run needs a manager review", createdAt, tone: "green" },
    { id: `activity_demo_expense_${period}`, messId: demoMessId, title: "Electricity bill added", detail: "Rafi recorded the monthly utility bill", createdAt, tone: "coral" },
    { id: `activity_demo_meals_${period}`, messId: demoMessId, title: "Meals recorded", detail: "Everyone has entries for this month", createdAt, tone: "blue" },
  ];

  const upsert = <T extends { id: string }>(name: string, items: T[]) =>
    items.map((item) =>
      db
        .collection(name)
        .updateOne({ id: item.id, messId: demoMessId }, { $setOnInsert: item }, { upsert: true }),
    );

  await Promise.all([
    ...upsert("members", members),
    ...upsert("rooms", rooms),
    ...upsert("expenses", expenses),
    ...upsert("bazar", bazar),
    ...upsert("activity", activities),
    // Meals are matched on the natural key the unique index enforces. Matching
    // on `id` would try to insert a second row for a day that already has one.
    ...meals.map((meal) =>
      db
        .collection<MealDocument>("meals")
        .updateOne(
          { messId: demoMessId, userId: meal.userId, date: meal.date },
          { $setOnInsert: meal },
          { upsert: true },
        ),
    ),
  ]);
  // Older demo records stored a per-member balance that is now always derived.
  await db.collection("members").updateMany({ messId: demoMessId }, { $unset: { balance: "" } });

  // Earlier versions seeded the demo with fixed ids that were not scoped to a
  // month. Those rows now sit alongside the month-scoped ones and double every
  // total, so clear them out.
  await Promise.all([
    db.collection("expenses").deleteMany({
      messId: demoMessId,
      id: { $in: ["expense_rent", "expense_electricity", "expense_wifi", "expense_filter", "expense_cleaner"] },
    }),
    db.collection("bazar").deleteMany({
      messId: demoMessId,
      id: { $in: ["bazar_1", "bazar_2", "bazar_3", "bazar_4"] },
    }),
    db.collection("activity").deleteMany({
      messId: demoMessId,
      id: { $in: ["activity_1", "activity_2", "activity_3"] },
    }),
    db.collection("meals").deleteMany({ messId: demoMessId, id: { $regex: /^meal_demo_\d{4}-/ } }),
  ]);
}

export async function getDemoIdentity(db: Db, role: "manager" | "admin") {
  await ensureDemoData(db);
  const userId = role === "admin" ? adminId : managerId;
  const user = await db.collection<UserDocument>("users").findOne({ id: userId });
  if (!user) throw new Error("The demo account could not be created.");
  return { user, messId: demoMessId, role: role as UserRole };
}
