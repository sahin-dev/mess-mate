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
import {
  listingTitle,
  mergePhotos,
  mergePreferences,
  mergeRules,
  statedPreferences,
} from "@/lib/listing-post";
import type { MessDocument } from "@/lib/server-utils";
import { computeSettlement } from "@/lib/settlement";
import { periodInZone, normalizeTimezone } from "@/lib/timezone";
import type {
  Facility,
  HouseRule,
  ListingPhoto,
  MessProperty,
  PreferredOccupant,
  Room,
  TenantPreferences,
} from "@/lib/types";

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
  /** The post headline and body, written by whoever advertised the room. */
  title: string;
  photos: ListingPhoto[];
  preferences: TenantPreferences;
  /** Only the preferences actually stated, ready to render. */
  stated: { label: string; value: string }[];
  rules: HouseRule[];
  /** The poster's display name and whether they run the house or live in it. */
  authorName: string;
  authorRole: "manager" | "member";
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
  title: string;
  /** The first photo, used as the card image. Null when the post has none. */
  coverPhotoId: string | null;
  photoCount: number;
  ruleCount: number;
  statedPreferences: { label: string; value: string }[];
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

  // Costs are the expensive part — several queries per house — and no filter
  // depends on them, so the cheap fields are built first, filtered and
  // trimmed, and only the listings that actually make the page get priced.
  const where = filters.where?.trim().toLowerCase();
  const shortlist = listings
    .map((listing) => {
      const mess = messById.get(listing.messId);
      const stored = roomById.get(listing.roomId);
      // A listing whose room or mess has been deleted simply does not appear.
      if (!mess || !stored) return null;
      const room = mergeRoom(stored);
      const property = mergeProperty(mess.property as Partial<MessProperty>, mess.location);
      const photos = mergePhotos(listing.photos);
      return {
        listing,
        mess,
        card: {
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
          title: listingTitle({ title: listing.title ?? "", roomName: room.name }, mess.name),
          coverPhotoId: photos.length > 0 ? photos[0].id : null,
          photoCount: photos.length,
          ruleCount: mergeRules(listing.rules).length,
          statedPreferences: statedPreferences(
            mergePreferences(listing.preferences, listing.preferredOccupant),
          ),
          facilityCount: mergeFacilities(mess.facilities as Facility[]).filter((f) => f.available)
            .length,
        },
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .filter(({ card }) => {
      if (filters.attachedBathroom && !card.attachedBathroom) return false;
      if (filters.balcony && !card.balcony) return false;
      if (filters.airConditioned && !card.airConditioned) return false;
      if (!where) return true;
      // A person searching types a neighbourhood, not a field name.
      return `${card.area} ${card.city} ${card.messName} ${card.addressLine} ${card.title}`
        .toLowerCase()
        .includes(where);
    })
    .slice(0, limit);

  // Several rooms in one house share a cost summary, so work it out once each.
  const costsByMess = new Map<string, Promise<PublicCosts>>();
  return Promise.all(
    shortlist.map(async ({ listing, mess, card }) => {
      const key = `${mess.id}:${listing.rentPerSeat}`;
      let costs = costsByMess.get(key);
      if (!costs) {
        costs = summariseCosts(db, mess, listing.rentPerSeat);
        costsByMess.set(key, costs);
      }
      return {
        ...card,
        estimatedMonthlyTotal: (await costs).estimatedMonthlyTotal,
      } satisfies PublicListingCard;
    }),
  );
}

/** The areas that actually have rooms, for the "popular areas" shortcuts. */
export async function loadListingAreas(db: Db) {
  // Deliberately not loadPublishedListings: that computes a full cost summary
  // per listing, and counting area names needs none of it. Going through it
  // made this the slowest query on the page by a wide margin.
  const listings = await db
    .collection<ListingDocument>("listings")
    .find({ status: "published" }, { projection: { messId: 1 } })
    .limit(500)
    .toArray();
  if (!listings.length) return [];

  const messIds = [...new Set(listings.map((listing) => listing.messId))];
  const messes = await db
    .collection<MessDocument>("messes")
    .find({ id: { $in: messIds } }, { projection: { id: 1, property: 1, location: 1 } })
    .toArray();
  const areaByMess = new Map(
    messes.map((mess) => {
      const property = mergeProperty(mess.property as Partial<MessProperty>, mess.location);
      return [mess.id, property.area || property.city];
    }),
  );

  const counts = new Map<string, number>();
  for (const listing of listings) {
    const area = areaByMess.get(listing.messId);
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
    title: listingTitle({ title: listing.title ?? "", roomName: stored.name }, mess.name),
    photos: mergePhotos(listing.photos),
    preferences: mergePreferences(listing.preferences, listing.preferredOccupant),
    stated: statedPreferences(mergePreferences(listing.preferences, listing.preferredOccupant)),
    rules: mergeRules(listing.rules),
    authorName: listing.authorName ?? "",
    authorRole: listing.authorRole ?? "manager",
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

  // Members and rooms do not vary by month, and the three ledgers are read for
  // the whole six-month window in one query each. Probing month by month meant
  // up to thirty round trips per house — and a house with no history paid all
  // thirty before giving up.
  const oldest = shiftPeriod(current, -6);
  const newest = shiftPeriod(current, -1);
  const window = { $gte: `${oldest}-01`, $lte: `${newest}-31` };
  const [members, rooms, allMeals, allExpenses, allBazar] = await Promise.all([
    db.collection<MemberDocument>("members").find({ messId: mess.id }).toArray(),
    db.collection<RoomDocument>("rooms").find({ messId: mess.id }).toArray(),
    db.collection<MealDocument>("meals").find({ messId: mess.id, date: window }).toArray(),
    db.collection<ExpenseDocument>("expenses").find({ messId: mess.id, date: window }).toArray(),
    db.collection<BazarDocument>("bazar").find({ messId: mess.id, date: window }).toArray(),
  ]);
  if (!allMeals.length && !allExpenses.length && !allBazar.length) return empty;

  // Most recent completed month first.
  for (let back = 1; back <= 6; back += 1) {
    const period = shiftPeriod(current, -back);
    const inMonth = <T extends { date: string }>(rows: T[]) =>
      rows.filter((row) => row.date.startsWith(period));
    const meals = inMonth(allMeals);
    const expenses = inMonth(allExpenses);
    const bazar = inMonth(allBazar);
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

/** The real number of published rooms, for copy that quotes a total. */
export async function countPublishedListings(db: Db): Promise<number> {
  return db.collection<ListingDocument>("listings").countDocuments({ status: "published" });
}
