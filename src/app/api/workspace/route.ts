import {
  addActivity,
  defaultSettings,
  ensureIndexes,
  getWorkspaceData,
  MEMBER_COLORS,
  type BazarDocument,
  type ExpenseDocument,
  type ListingDocument,
  type MealDocument,
  type MemberDocument,
  type RoomDocument,
} from "@/lib/data";
import { revalidatePath } from "next/cache";
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
import { emptyProperty, slugify } from "@/lib/property";
import type { Facility, MessProperty, MessSettings, Room, UserRole } from "@/lib/types";

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

const optionalText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function coordinatesOrNull(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const point = value as { lat?: unknown; lng?: unknown };
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new ApiError(400, "That map position is outside the world.");
  }
  // Six decimals is roughly 10 cm, which is far more than a flat needs.
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

function roomFeatures(body: Record<string, unknown>) {
  return {
    attachedBathroom: Boolean(body.attachedBathroom),
    balcony: Boolean(body.balcony),
    airConditioned: Boolean(body.airConditioned),
    furnishing: enumValue(
      body.furnishing ?? "unfurnished",
      ["unfurnished", "partly", "furnished"] as const,
      "Furnishing",
    ),
    notes: optionalText(body.notes, 300),
  };
}

/**
 * Who an entry belongs to. Managers may act for any active member; everyone
 * else is pinned to themselves regardless of what the request asks for.
 */
async function resolveMealTarget(
  db: Awaited<ReturnType<typeof requireSession>>["db"],
  messId: string,
  selfId: string,
  role: UserRole,
  requested: unknown,
) {
  const isManager = role === "manager" || role === "admin";
  if (!isManager || typeof requested !== "string" || !requested || requested === selfId) {
    const self = await db
      .collection<MemberDocument>("members")
      .findOne({ id: selfId, messId });
    return { id: selfId, name: self?.name ?? "A member" };
  }
  const member = await db
    .collection<MemberDocument>("members")
    .findOne({ id: requested, messId, status: "active" });
  if (!member) throw new ApiError(404, "That member is not active in this mess.");
  return { id: member.id, name: member.name };
}

/** Purges the cached community pages for one listing. */
function revalidateCommunity(slug: string) {
  revalidatePath("/community");
  revalidatePath(`/community/${slug}`);
}

/** Anything that changes the house also changes every listing that shows it. */
async function revalidateListingsFor(
  db: Awaited<ReturnType<typeof requireSession>>["db"],
  messId: string,
) {
  const listings = await db
    .collection<ListingDocument>("listings")
    .find({ messId, status: "published" }, { projection: { slug: 1 } })
    .toArray();
  if (!listings.length) return;
  revalidatePath("/community");
  for (const listing of listings) revalidatePath(`/community/${listing.slug}`);
}

/** Slugs are permanent once published, so they are made unique on creation. */
async function uniqueSlug(
  db: Awaited<ReturnType<typeof requireSession>>["db"],
  seed: string,
) {
  const base = slugify(seed);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    if (!(await db.collection<ListingDocument>("listings").findOne({ slug }))) return slug;
  }
  throw new ApiError(503, "Could not create a web address for that listing. Please try again.");
}

const randomSuffix = () => Math.random().toString(36).slice(2, 6);

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

      // Already a member: just open the workspace again.
      if (existing?.status === "active") {
        const role: UserRole = existing.role === "Manager" ? "manager" : "member";
        await db
          .collection<MemberDocument>("members")
          .updateOne({ id: existing.id, messId: mess.id }, { $set: { userId: user.id, name: user.name } });
        await setActiveWorkspace(db, session, mess.id, role);
        return Response.json({ status: "joined", messName: mess.name });
      }

      if (existing?.status === "requested") {
        return Response.json({ status: "pending", messName: mess.name });
      }

      // An invitation is the manager having already said yes, so it converts
      // straight into membership rather than asking them again.
      if (existing?.status === "invited") {
        const { _id: _placeholder, ...invited } = existing;
        await db.collection<MemberDocument>("members").deleteOne({ id: existing.id, messId: mess.id });
        await db.collection<MemberDocument>("members").insertOne({
          ...invited,
          id: user.id,
          userId: user.id,
          name: user.name,
          status: "active",
          joinedAt: todayInZone(DEFAULT_TIMEZONE),
        });
        const role: UserRole = existing.role === "Manager" ? "manager" : "member";
        await setActiveWorkspace(db, session, mess.id, role);
        await addActivity(db, mess.id, "Member joined", `${user.name} accepted their invitation`, "green");
        return Response.json({ status: "joined", messName: mess.name });
      }

      // Otherwise it is a request, and a manager decides.
      const memberCount = await db.collection("members").countDocuments({ messId: mess.id });
      await db.collection<MemberDocument>("members").insertOne({
        // The member id is the user id for any membership backed by an account:
        // the settlement matches a member's meals by this id.
        id: user.id,
        messId: mess.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: "Member",
        roomId: null,
        status: "requested",
        joinedAt: todayInZone(DEFAULT_TIMEZONE),
        color: MEMBER_COLORS[memberCount % MEMBER_COLORS.length],
      });
      await addActivity(db, mess.id, "Join request", `${user.name} asked to join`, "blue");
      return Response.json({ status: "pending", messName: mess.name });
    }

    if (action === "cancelJoinRequest") {
      const { db, user } = await requireSession();
      await db
        .collection<MemberDocument>("members")
        .deleteMany({ userId: user.id, status: "requested" });
      return Response.json({ ok: true });
    }

    if (action === "leaveMess") {
      const { db, session, user } = await requireWorkspace();
      const membership = await db
        .collection<MemberDocument>("members")
        .findOne({ messId: session.activeMessId!, userId: user.id });
      if (!membership) throw new ApiError(404, "You are not a member of this mess.");

      const mess = await db.collection<MessDocument>("messes").findOne({ id: session.activeMessId! });
      // The owner would leave the house without anyone able to manage it.
      if (mess && membership.id === mess.managerId) {
        throw new ApiError(
          409,
          "You created this mess, so hand it to another manager before you leave.",
        );
      }
      const pendingBazar = await db
        .collection<BazarDocument>("bazar")
        .countDocuments({ messId: mess?.id, memberId: membership.id, status: "Pending" });
      if (pendingBazar) {
        throw new ApiError(409, "Your bazar entries are still awaiting approval. Ask a manager to review them first.");
      }

      await db.collection<MemberDocument>("members").deleteOne({ id: membership.id, messId: mess!.id });
      await db
        .collection("sessions")
        .updateMany({ userId: user.id }, { $set: { activeMessId: null, role: null } });
      await addActivity(db, mess!.id, "Member left", `${user.name} left the mess`, "coral");
      return Response.json({ ok: true });
    }

    const { db, user, mess, role } = await requireWorkspace();
    const messId = mess.id;
    const settings: MessSettings = {
      ...defaultSettings,
      ...(mess.settings as Partial<MessSettings>),
    };

    if (action === "saveMeals") {
      const date = dateString(body.date);
      // A manager may record for anyone in the mess; everyone else only for
      // themselves, whatever the request claims.
      const target = await resolveMealTarget(db, messId, user.id, role, body.memberId);
      assertMealEditable(date, settings, role);
      const meals = body.meals as Record<string, unknown> | undefined;
      if (!meals) throw new ApiError(400, "Meal values are required.");
      const values = {
        breakfast: Math.round(cleanNumber(meals.breakfast, "Breakfast", 0, 9)),
        lunch: Math.round(cleanNumber(meals.lunch, "Lunch", 0, 9)),
        dinner: Math.round(cleanNumber(meals.dinner, "Dinner", 0, 9)),
      };
      await db.collection<MealDocument>("meals").updateOne(
        { messId, userId: target.id, date },
        {
          $set: { ...values, status: settings.mealApproval ? "Pending" : "Open" },
          $setOnInsert: { id: newId("meal"), messId, userId: target.id, date },
        },
        { upsert: true },
      );
      if (target.id !== user.id) {
        await addActivity(
          db,
          messId,
          "Meals recorded for a member",
          `${user.name} set ${target.name}'s meals for ${date}`,
          "blue",
        );
      }
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
      const buyer = await resolveMealTarget(db, messId, user.id, role, body.memberId);
      const entry: BazarDocument = {
        id: newId("bazar"),
        messId,
        memberId: buyer.id,
        by: buyer.name,
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
        buyer.id === user.id
          ? `${user.name} submitted BDT ${entry.amount.toLocaleString("en-US")}`
          : `${user.name} recorded BDT ${entry.amount.toLocaleString("en-US")} bought by ${buyer.name}`,
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
    } else if (action === "saveProperty") {
      requireManager(role);
      const incoming = (body.property ?? {}) as Partial<MessProperty>;
      const parking = incoming.parking ?? emptyProperty.parking;
      const property: MessProperty = {
        addressLine: optionalText(incoming.addressLine, 160),
        area: optionalText(incoming.area, 120),
        city: optionalText(incoming.city, 120),
        postcode: optionalText(incoming.postcode, 20),
        floor: optionalText(incoming.floor, 24),
        flatNumber: optionalText(incoming.flatNumber, 24),
        hasLift: Boolean(incoming.hasLift),
        parking: {
          available: Boolean(parking.available),
          type: enumValue(parking.type ?? "car", ["car", "motorbike", "both"] as const, "Parking type"),
          spots: Math.round(cleanNumber(parking.spots ?? 0, "Parking spaces", 0, 99)),
          monthlyCost: cleanNumber(parking.monthlyCost ?? 0, "Parking cost", 0),
          procedure: optionalText(parking.procedure, 600),
        },
        coordinates: coordinatesOrNull(incoming.coordinates),
        notes: optionalText(incoming.notes, 1000),
      };
      await db.collection<MessDocument>("messes").updateOne(
        { id: messId },
        // `location` stays in step, because it is what older screens display.
        { $set: { property, location: [property.area, property.city].filter(Boolean).join(", ") || mess.location } },
      );
      await revalidateListingsFor(db, messId);
      await addActivity(db, messId, "House details updated", `${user.name} updated the building and flat details`, "blue");
    } else if (action === "saveFacilities") {
      requireManager(role);
      const incoming = Array.isArray(body.facilities) ? body.facilities : [];
      if (incoming.length > 60) throw new ApiError(400, "That is more facilities than we can store.");
      const facilities: Facility[] = incoming.map((entry, index) => {
        const item = entry as Partial<Facility>;
        return {
          id: typeof item.id === "string" && item.id ? item.id.slice(0, 60) : newId("facility"),
          label: cleanString(item.label, `Facility ${index + 1}`, 80),
          available: Boolean(item.available),
          detail: optionalText(item.detail, 200),
        };
      });
      await db.collection<MessDocument>("messes").updateOne({ id: messId }, { $set: { facilities } });
      await revalidateListingsFor(db, messId);
      await addActivity(db, messId, "Facilities updated", `${user.name} updated what the house has`, "blue");
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
        ...roomFeatures(body),
      };
      await db.collection<RoomDocument>("rooms").insertOne(room);
      await addActivity(db, messId, "Room added", `${room.name} was added to the house`, "blue");
    } else if (action === "updateRoom") {
      requireManager(role);
      const id = cleanString(body.id, "Room", 100);
      const result = await db.collection<RoomDocument>("rooms").updateOne(
        { id, messId },
        {
          $set: {
            name: cleanString(body.name, "Room name", 60),
            type: cleanString(body.type || "Shared room", "Room description", 80),
            rent: cleanNumber(body.rent, "Monthly rent", 0),
            capacity: Math.round(cleanNumber(body.capacity, "Capacity", 1, 20)),
            ...roomFeatures(body),
          },
        },
      );
      if (!result.matchedCount) throw new ApiError(404, "That room no longer exists.");
      await revalidateListingsFor(db, messId);
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
    } else if (action === "approveMember") {
      requireManager(role);
      const id = cleanString(body.id, "Member", 100);
      const pending = await db
        .collection<MemberDocument>("members")
        .findOne({ id, messId, status: "requested" });
      if (!pending) throw new ApiError(404, "That request no longer exists.");

      // A room can be chosen at the same time, which is the usual next step.
      let roomId: string | null = null;
      if (typeof body.roomId === "string" && body.roomId) {
        const room = await db.collection<RoomDocument>("rooms").findOne({ id: body.roomId, messId });
        if (!room) throw new ApiError(404, "That room no longer exists.");
        const occupied = await db
          .collection<MemberDocument>("members")
          .countDocuments({ messId, roomId: room.id });
        if (occupied >= room.capacity) throw new ApiError(409, `${room.name} is already full.`);
        roomId = room.id;
      }

      await db
        .collection<MemberDocument>("members")
        .updateOne(
          { id, messId },
          { $set: { status: "active", roomId, joinedAt: todayInZone(settings.timezone) } },
        );
      // Open the workspace for them wherever they are already signed in.
      if (pending.userId) {
        await db
          .collection("sessions")
          .updateMany({ userId: pending.userId }, { $set: { activeMessId: messId, role: "member" } });
      }
      await addActivity(db, messId, "Join request accepted", `${user.name} let ${pending.name} in`, "green");
    } else if (action === "rejectMember") {
      requireManager(role);
      const id = cleanString(body.id, "Member", 100);
      const pending = await db
        .collection<MemberDocument>("members")
        .findOne({ id, messId, status: "requested" });
      if (!pending) throw new ApiError(404, "That request no longer exists.");
      await db.collection<MemberDocument>("members").deleteOne({ id, messId });
      await addActivity(db, messId, "Join request declined", `${user.name} declined ${pending.name}`, "coral");
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
      if (id === (await db.collection<MemberDocument>("members").findOne({ userId: user.id, messId }))?.id) {
        throw new ApiError(409, "Use “Leave this mess” to remove yourself.");
      }
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
    } else if (action === "saveListing") {
      requireManager(role);
      const roomId = cleanString(body.roomId, "Room", 100);
      const room = await db.collection<RoomDocument>("rooms").findOne({ id: roomId, messId });
      if (!room) throw new ApiError(404, "That room no longer exists.");

      const seats = Math.round(cleanNumber(body.seats, "Seats", 1, 20));
      if (seats > room.capacity) {
        throw new ApiError(400, `${room.name} sleeps ${room.capacity}, so it cannot be let to ${seats}.`);
      }
      const existing = body.id
        ? await db.collection<ListingDocument>("listings").findOne({ id: cleanString(body.id, "Listing", 100), messId })
        : null;

      const now = new Date().toISOString();
      const listing: ListingDocument = {
        id: existing?.id ?? newId("listing"),
        messId,
        slug: existing?.slug ?? (await uniqueSlug(db, `${mess.name} ${room.name}`)),
        roomId,
        status: enumValue(body.status ?? "draft", ["draft", "published"] as const, "Status"),
        seats,
        rentPerSeat: cleanNumber(body.rentPerSeat, "Rent per seat", 0),
        description: optionalText(body.description, 2000),
        availableFrom: dateString(body.availableFrom ?? todayInZone(settings.timezone), "Available from"),
        preferredOccupant: enumValue(
          body.preferredOccupant ?? "anyone",
          ["anyone", "students", "professionals"] as const,
          "Preferred occupant",
        ),
        // Contact details are typed in deliberately rather than taken from the
        // account, because publishing makes them public.
        contactName: optionalText(body.contactName, 80) || user.name,
        contactPhone: optionalText(body.contactPhone, 40),
        contactEmail: optionalText(body.contactEmail, 180),
        publishedAt:
          body.status === "published" ? (existing?.publishedAt ?? now) : (existing?.publishedAt ?? null),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (listing.status === "published" && !listing.contactPhone && !listing.contactEmail) {
        throw new ApiError(400, "Add a phone number or an email so people can reach you.");
      }

      await db
        .collection<ListingDocument>("listings")
        .updateOne({ id: listing.id, messId }, { $set: listing }, { upsert: true });
      // The community pages are cached, so publishing or editing has to purge
      // them; otherwise a taken-down room stays readable until the cache ages out.
      revalidateCommunity(listing.slug);
      await addActivity(
        db,
        messId,
        listing.status === "published" ? "Room listed publicly" : "Listing saved as a draft",
        listing.status === "published"
          ? `${user.name} published ${room.name} to the community`
          : `${user.name} saved a draft listing for ${room.name}`,
        listing.status === "published" ? "coral" : "blue",
      );
    } else if (action === "unpublishListing") {
      requireManager(role);
      const id = cleanString(body.id, "Listing", 100);
      const result = await db
        .collection<ListingDocument>("listings")
        .updateOne({ id, messId }, { $set: { status: "draft", updatedAt: new Date().toISOString() } });
      if (!result.matchedCount) throw new ApiError(404, "That listing no longer exists.");
      const takenDown = await db.collection<ListingDocument>("listings").findOne({ id, messId });
      if (takenDown) revalidateCommunity(takenDown.slug);
      await addActivity(db, messId, "Listing taken down", `${user.name} removed a room from the community`, "coral");
    } else if (action === "deleteListing") {
      requireManager(role);
      const id = cleanString(body.id, "Listing", 100);
      const doomed = await db.collection<ListingDocument>("listings").findOne({ id, messId });
      const result = await db.collection<ListingDocument>("listings").deleteOne({ id, messId });
      if (!result.deletedCount) throw new ApiError(404, "That listing no longer exists.");
      if (doomed) revalidateCommunity(doomed.slug);
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
