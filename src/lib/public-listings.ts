import type { Db } from "mongodb";
import type {
  BazarDocument,
  ExpenseDocument,
  ListingDocument,
  MealDocument,
  MemberDocument,
  RoomDocument,
} from "@/lib/data";
import { periodLabel, shiftPeriod, type Period } from "@/lib/period";
import { mergeFacilities, mergeProperty, mergeRoom } from "@/lib/property";
import type { MessDocument } from "@/lib/server-utils";
import { computeSettlement } from "@/lib/settlement";
import { periodInZone, normalizeTimezone } from "@/lib/timezone";
import type { Facility, MessProperty, PreferredOccupant, Room } from "@/lib/types";

/**
 * What a published listing shows to the world.
 *
 * The mess decides to publish; this module decides what that can possibly mean.
 * It deliberately never carries a member's name, email or balance — a listing
 * advertises a room and what living there costs, not who lives there.
 */

export type PublicCosts = {
  /** The month the figures come from; always a completed one. */
  period: Period | null;
  periodLabel: string | null;
  rentPerSeat: number;
  mealRate: number;
  averageMealsPerMember: number;
  foodPerMonth: number;
  billsPerMonth: number;
  estimatedMonthlyTotal: number;
  memberCount: number;
  breakdown: { label: string; amount: number; note: string }[];
};

export type PublicListing = {
  slug: string;
  messName: string;
  property: MessProperty;
  room: Room;
  facilities: Facility[];
  seats: number;
  rentPerSeat: number;
  description: string;
  availableFrom: string;
  preferredOccupant: PreferredOccupant;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  publishedAt: string | null;
  updatedAt: string;
  costs: PublicCosts;
};

export type PublicListingCard = Pick<
  PublicListing,
  "slug" | "messName" | "seats" | "rentPerSeat" | "availableFrom" | "preferredOccupant"
> & {
  area: string;
  city: string;
  addressLine: string;
  roomName: string;
  roomType: string;
  attachedBathroom: boolean;
  balcony: boolean;
  airConditioned: boolean;
  estimatedMonthlyTotal: number;
  facilityCount: number;
};

export type ListingFilters = {
  /** Matches area, city, address or mess name. */
  where?: string;
  maxRent?: number;
  seats?: number;
  attachedBathroom?: boolean;
  balcony?: boolean;
  airConditioned?: boolean;
};

/** Newest first, capped — the community index is a browse, not an export. */
export async function loadPublishedListings(
  db: Db,
  limit = 60,
  filters: ListingFilters = {},
): Promise<PublicListingCard[]> {
  const query: Record<string, unknown> = { status: "published" };
  if (filters.maxRent) query.rentPerSeat = { $lte: filters.maxRent };
  if (filters.seats) query.seats = { $gte: filters.seats };

  const listings = await db
    .collection<ListingDocument>("listings")
    .find(query)
    .sort({ publishedAt: -1 })
    // Room and house filters are applied after the join below, so read a
    // wider slice first and trim once everything is known.
    .limit(Math.max(limit * 3, 90))
    .toArray();
  if (!listings.length) return [];

  const messIds = [...new Set(listings.map((listing) => listing.messId))];
  const [messes, rooms] = await Promise.all([
    db.collection<MessDocument>("messes").find({ id: { $in: messIds } }).toArray(),
    db
      .collection<RoomDocument>("rooms")
      .find({ id: { $in: listings.map((listing) => listing.roomId) } })
      .toArray(),
  ]);
  const messById = new Map(messes.map((mess) => [mess.id, mess]));
  const roomById = new Map(rooms.map((room) => [room.id, room]));

  const cards = await Promise.all(
    listings.map(async (listing) => {
      const mess = messById.get(listing.messId);
      const stored = roomById.get(listing.roomId);
      // A listing whose room or mess has been deleted simply does not appear.
      if (!mess || !stored) return null;
      const room = mergeRoom(stored);
      const property = mergeProperty(mess.property as Partial<MessProperty>, mess.location);
      const costs = await summariseCosts(db, mess, listing.rentPerSeat);
      return {
        slug: listing.slug,
        messName: mess.name,
        area: property.area,
        city: property.city,
        addressLine: property.addressLine,
        roomName: room.name,
        roomType: room.type,
        attachedBathroom: room.attachedBathroom,
        balcony: room.balcony,
        airConditioned: room.airConditioned,
        seats: listing.seats,
        rentPerSeat: listing.rentPerSeat,
        availableFrom: listing.availableFrom,
        preferredOccupant: listing.preferredOccupant,
        estimatedMonthlyTotal: costs.estimatedMonthlyTotal,
        facilityCount: mergeFacilities(mess.facilities as Facility[]).filter((f) => f.available).length,
      } satisfies PublicListingCard;
    }),
  );
  const where = filters.where?.trim().toLowerCase();
  return cards
    .filter((card): card is PublicListingCard => card !== null)
    .filter((card) => {
      if (filters.attachedBathroom && !card.attachedBathroom) return false;
      if (filters.balcony && !card.balcony) return false;
      if (filters.airConditioned && !card.airConditioned) return false;
      if (!where) return true;
      // A person searching types a neighbourhood, not a field name.
      return `${card.area} ${card.city} ${card.messName} ${card.addressLine}`
        .toLowerCase()
        .includes(where);
    })
    .slice(0, limit);
}

/** The areas that actually have rooms, for the "popular areas" shortcuts. */
export async function loadListingAreas(db: Db) {
  const cards = await loadPublishedListings(db, 200);
  const counts = new Map<string, number>();
  for (const card of cards) {
    const area = card.area || card.city;
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export async function loadPublishedListing(db: Db, slug: string): Promise<PublicListing | null> {
  const listing = await db
    .collection<ListingDocument>("listings")
    .findOne({ slug, status: "published" });
  if (!listing) return null;

  const [mess, stored] = await Promise.all([
    db.collection<MessDocument>("messes").findOne({ id: listing.messId }),
    db.collection<RoomDocument>("rooms").findOne({ id: listing.roomId, messId: listing.messId }),
  ]);
  if (!mess || !stored) return null;

  return {
    slug: listing.slug,
    messName: mess.name,
    property: mergeProperty(mess.property as Partial<MessProperty>, mess.location),
    room: mergeRoom(stored),
    facilities: mergeFacilities(mess.facilities as Facility[]).filter((facility) => facility.available),
    seats: listing.seats,
    rentPerSeat: listing.rentPerSeat,
    description: listing.description,
    availableFrom: listing.availableFrom,
    preferredOccupant: listing.preferredOccupant,
    contactName: listing.contactName,
    contactPhone: listing.contactPhone,
    contactEmail: listing.contactEmail,
    publishedAt: listing.publishedAt,
    updatedAt: listing.updatedAt,
    costs: await summariseCosts(db, mess, listing.rentPerSeat),
  };
}

/**
 * The real cost of living there, taken from the most recent completed month.
 *
 * The month in progress is deliberately skipped: half a month of bazar makes a
 * house look far cheaper than it is. If no completed month has data, the
 * figures are reported as unavailable rather than guessed.
 */
async function summariseCosts(
  db: Db,
  mess: MessDocument,
  rentPerSeat: number,
): Promise<PublicCosts> {
  const settings = (mess.settings ?? {}) as { timezone?: string };
  const timeZone = normalizeTimezone(settings.timezone);
  const current = periodInZone(timeZone);

  const empty: PublicCosts = {
    period: null,
    periodLabel: null,
    rentPerSeat,
    mealRate: 0,
    averageMealsPerMember: 0,
    foodPerMonth: 0,
    billsPerMonth: 0,
    estimatedMonthlyTotal: rentPerSeat,
    memberCount: 0,
    breakdown: [{ label: "Room rent", amount: rentPerSeat, note: "per person, per month" }],
  };

  // Look back up to six months for one with something in it.
  for (let back = 1; back <= 6; back += 1) {
    const period = shiftPeriod(current, -back);
    const range = { $gte: `${period}-01`, $lte: `${period}-31` };
    const [members, rooms, meals, expenses, bazar] = await Promise.all([
      db.collection<MemberDocument>("members").find({ messId: mess.id }).toArray(),
      db.collection<RoomDocument>("rooms").find({ messId: mess.id }).toArray(),
      db.collection<MealDocument>("meals").find({ messId: mess.id, date: range }).toArray(),
      db.collection<ExpenseDocument>("expenses").find({ messId: mess.id, date: range }).toArray(),
      db.collection<BazarDocument>("bazar").find({ messId: mess.id, date: range }).toArray(),
    ]);
    if (!meals.length && !expenses.length && !bazar.length) continue;

    const settlement = computeSettlement({
      period,
      members,
      rooms,
      meals,
      bazar,
      expenses: expenses.map((expense) => ({ ...expense, paidById: expense.createdBy })),
    });
    const memberCount = Math.max(1, settlement.members.length);
    const averageMeals = Math.round(settlement.totalMeals / memberCount);
    const foodPerMonth = Math.round(averageMeals * settlement.mealRate);
    // Rent recorded as a shared bill is already covered by the room rent above,
    // so only non-rent bills are added here.
    const billsPerMonth = Math.round(
      settlement.byCategory
        .filter((slice) => slice.label !== "Bazar" && slice.label !== "Fixed")
        .reduce((sum, slice) => sum + slice.amount, 0) / memberCount,
    );

    return {
      period,
      periodLabel: periodLabel(period),
      rentPerSeat,
      mealRate: settlement.mealRate,
      averageMealsPerMember: averageMeals,
      foodPerMonth,
      billsPerMonth,
      estimatedMonthlyTotal: rentPerSeat + foodPerMonth + billsPerMonth,
      memberCount: settlement.members.length,
      breakdown: [
        { label: "Room rent", amount: rentPerSeat, note: "per person, per month" },
        {
          label: "Food",
          amount: foodPerMonth,
          note: `${averageMeals} meals at ${settlement.mealRate.toFixed(2)} each`,
        },
        {
          label: "Utilities and upkeep",
          amount: billsPerMonth,
          note: `shared between ${settlement.members.length} people`,
        },
      ].filter((row) => row.amount > 0),
    };
  }

  return empty;
}
