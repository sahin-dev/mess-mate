import type {
  FoodPreference,
  HouseRule,
  Listing,
  ListingPhoto,
  MaritalPreference,
  OccupantGender,
  PreferredOccupant,
  SmokingRule,
  TenantPreferences,
} from "@/lib/types";

/**
 * Defaults and catalogues for a to-let post.
 *
 * Listings written before the post fields existed have none of them, so every
 * read merges against these defaults instead of checking for undefined at each
 * use site — the same approach `property.ts` takes for the house.
 */

export const emptyPreferences: TenantPreferences = {
  occupation: "anyone",
  gender: "anyone",
  smoking: "either",
  food: "either",
  religion: "",
  maritalStatus: "anyone",
  notes: "",
};

export function mergePreferences(
  stored: Partial<TenantPreferences> | undefined,
  /** Older listings only had this one field; carry it into the new shape. */
  legacyOccupant?: PreferredOccupant,
): TenantPreferences {
  const merged = { ...emptyPreferences, ...(stored ?? {}) };
  if (!stored?.occupation && legacyOccupant) merged.occupation = legacyOccupant;
  return merged;
}

export const OCCUPATION_LABEL: Record<PreferredOccupant, string> = {
  anyone: "Anyone",
  students: "Students",
  professionals: "Working professionals",
};

export const GENDER_LABEL: Record<OccupantGender, string> = {
  anyone: "Anyone",
  men: "Men",
  women: "Women",
};

export const SMOKING_LABEL: Record<SmokingRule, string> = {
  either: "No preference",
  "non-smokers": "Non-smokers",
};

export const FOOD_LABEL: Record<FoodPreference, string> = {
  either: "No preference",
  vegetarian: "Vegetarian",
  "no-beef": "No beef cooked",
  halal: "Halal kitchen",
};

export const MARITAL_LABEL: Record<MaritalPreference, string> = {
  anyone: "Anyone",
  single: "Single people",
  family: "Families",
};

/**
 * The preferences worth showing, in reading order.
 *
 * "No preference" entries are dropped, so a post that states nothing shows
 * nothing rather than a wall of "Anyone".
 */
export function statedPreferences(preferences: TenantPreferences) {
  const stated: { label: string; value: string }[] = [];
  if (preferences.occupation !== "anyone") {
    stated.push({ label: "Suits", value: OCCUPATION_LABEL[preferences.occupation] });
  }
  if (preferences.gender !== "anyone") {
    stated.push({ label: "Looking for", value: GENDER_LABEL[preferences.gender] });
  }
  if (preferences.smoking !== "either") {
    stated.push({ label: "Smoking", value: SMOKING_LABEL[preferences.smoking] });
  }
  if (preferences.food !== "either") {
    stated.push({ label: "Food", value: FOOD_LABEL[preferences.food] });
  }
  if (preferences.maritalStatus !== "anyone") {
    stated.push({ label: "Household", value: MARITAL_LABEL[preferences.maritalStatus] });
  }
  if (preferences.religion.trim()) {
    stated.push({ label: "Religion", value: preferences.religion.trim() });
  }
  return stated;
}

/**
 * Starting points for house rules.
 *
 * People find it far easier to edit a sentence than to invent one, and the
 * concrete examples set the tone: a rule says what and why.
 */
export const RULE_SUGGESTIONS = [
  "Lights off by midnight — the room is shared.",
  "Quiet hours from 11pm on weeknights.",
  "No smoking anywhere inside the flat.",
  "Guests are fine, but tell your roommate first.",
  "No overnight guests without asking the house.",
  "Wash your own plates the same day.",
  "Your turn on the bazar roster comes round about once a fortnight.",
  "Shoes off at the door.",
  "Keep the balcony door shut after 10pm.",
  "Rent is due in the first week of the month.",
];

export const MAX_RULES = 12;
export const MAX_PHOTOS = 8;
/** After downscaling. A phone photo lands well under this. */
export const MAX_PHOTO_BYTES = 1_500_000;

export function mergeRules(stored: unknown): HouseRule[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((rule, index) => {
      if (typeof rule === "string") return { id: `rule-${index}`, text: rule };
      const value = rule as Partial<HouseRule>;
      return { id: value?.id ?? `rule-${index}`, text: value?.text ?? "" };
    })
    .filter((rule) => rule.text.trim().length > 0)
    .slice(0, MAX_RULES);
}

export function mergePhotos(stored: unknown): ListingPhoto[] {
  if (!Array.isArray(stored)) return [];
  return stored
    .map((photo) => {
      const value = photo as Partial<ListingPhoto>;
      return {
        id: String(value?.id ?? ""),
        caption: String(value?.caption ?? ""),
        width: Number(value?.width) || 0,
        height: Number(value?.height) || 0,
      };
    })
    .filter((photo) => photo.id)
    .slice(0, MAX_PHOTOS);
}

/**
 * The URL a photo is served from. Ids are opaque, so this is safe to embed.
 *
 * Deliberately outside /api: everything under there is blanket-marked
 * no-store for the signed-in workspace, and a photo on a published post is
 * public and wants to be cached.
 */
export function photoUrl(id: string) {
  return `/photo/${id}`;
}

/**
 * A headline for a post that has none, so older listings and half-finished
 * drafts still read as posts rather than as blank rows.
 */
export function listingTitle(listing: Pick<Listing, "title" | "roomName">, messName: string) {
  return listing.title.trim() || `${listing.roomName} in ${messName}`;
}

/**
 * Fills in the post fields for a listing written before they existed, so the
 * rest of the app can read `listing.preferences.gender` without guarding.
 */
export function mergeListing(
  stored: Partial<Listing> & { roomName: string },
): Listing {
  return {
    id: stored.id ?? "",
    slug: stored.slug ?? "",
    roomId: stored.roomId ?? "",
    roomName: stored.roomName,
    status: stored.status ?? "draft",
    title: stored.title ?? "",
    seats: stored.seats ?? 1,
    rentPerSeat: stored.rentPerSeat ?? 0,
    description: stored.description ?? "",
    availableFrom: stored.availableFrom ?? "",
    preferredOccupant: stored.preferredOccupant ?? "anyone",
    preferences: mergePreferences(stored.preferences, stored.preferredOccupant),
    rules: mergeRules(stored.rules),
    photos: mergePhotos(stored.photos),
    authorId: stored.authorId ?? "",
    authorName: stored.authorName ?? "",
    authorRole: stored.authorRole ?? "manager",
    contactName: stored.contactName ?? "",
    contactPhone: stored.contactPhone ?? "",
    contactEmail: stored.contactEmail ?? "",
    publishedAt: stored.publishedAt ?? null,
    updatedAt: stored.updatedAt ?? "",
  };
}
