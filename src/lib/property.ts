import type { Facility, Furnishing, MessProperty, ParkingType, Room } from "@/lib/types";

/**
 * Defaults and catalogues for the house.
 *
 * A mess created before these fields existed simply has none of them, so every
 * read merges against these defaults rather than checking for undefined at each
 * use site.
 */

export const emptyProperty: MessProperty = {
  addressLine: "",
  area: "",
  city: "",
  postcode: "",
  floor: "",
  flatNumber: "",
  hasLift: false,
  parking: { available: false, type: "car", spots: 0, monthlyCost: 0, procedure: "" },
  coordinates: null,
  notes: "",
};

export function mergeProperty(stored: Partial<MessProperty> | undefined, location = ""): MessProperty {
  const merged: MessProperty = {
    ...emptyProperty,
    ...stored,
    parking: { ...emptyProperty.parking, ...(stored?.parking ?? {}) },
    coordinates: stored?.coordinates ?? null,
  };
  // Older messes only stored a free-text location; show it rather than nothing.
  if (!merged.area && !merged.city && location) merged.area = location;
  return merged;
}

/** A one-line address for headings and listing cards. */
export function propertySummary(property: MessProperty) {
  const flat = [
    property.flatNumber && `Flat ${property.flatNumber}`,
    property.floor && `${property.floor} floor`,
  ]
    .filter(Boolean)
    .join(", ");
  return [flat, property.addressLine, property.area, property.city].filter(Boolean).join(" · ");
}

export const PARKING_LABEL: Record<ParkingType, string> = {
  car: "Car",
  motorbike: "Motorbike",
  both: "Car and motorbike",
};

export const FURNISHING_LABEL: Record<Furnishing, string> = {
  unfurnished: "Unfurnished",
  partly: "Partly furnished",
  furnished: "Furnished",
};

export const FLOOR_OPTIONS = [
  "Ground",
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
];

/**
 * The things people actually ask about before moving into a shared flat. A
 * manager can add anything else; these just mean nobody starts from a blank page.
 */
export const FACILITY_CATALOGUE: { id: string; label: string; hint?: string }[] = [
  { id: "fridge", label: "Fridge" },
  { id: "water_filter", label: "Water filter", hint: "Brand or last service date" },
  { id: "gas", label: "Cooking gas", hint: "Line or cylinder" },
  { id: "wifi", label: "Wi-Fi", hint: "Speed or provider" },
  { id: "washing_machine", label: "Washing machine" },
  { id: "geyser", label: "Hot water / geyser" },
  { id: "generator", label: "Generator or IPS", hint: "What it runs during load shedding" },
  { id: "oven", label: "Oven or microwave" },
  { id: "rice_cooker", label: "Rice cooker" },
  { id: "dining_table", label: "Dining table" },
  { id: "cleaner", label: "Cleaner", hint: "How often they come" },
  { id: "cook", label: "Cook", hint: "Which meals they cook" },
  { id: "security", label: "Security guard" },
  { id: "cctv", label: "CCTV" },
  { id: "rooftop", label: "Rooftop access" },
];

export function defaultFacilities(): Facility[] {
  return FACILITY_CATALOGUE.map((item) => ({
    id: item.id,
    label: item.label,
    available: false,
    detail: "",
  }));
}

/**
 * Keeps whatever the manager has already answered and appends any catalogue
 * entry added since, so the list grows without losing their edits.
 */
export function mergeFacilities(stored: Facility[] | undefined): Facility[] {
  const byId = new Map((stored ?? []).map((facility) => [facility.id, facility]));
  const merged = FACILITY_CATALOGUE.map(
    (item) =>
      byId.get(item.id) ?? { id: item.id, label: item.label, available: false, detail: "" },
  );
  // Anything the manager added themselves keeps its place at the end.
  for (const facility of stored ?? []) {
    if (!FACILITY_CATALOGUE.some((item) => item.id === facility.id)) merged.push(facility);
  }
  return merged;
}

export const emptyRoomExtras = {
  attachedBathroom: false,
  balcony: false,
  airConditioned: false,
  furnishing: "unfurnished" as Furnishing,
  notes: "",
};

export function mergeRoom(stored: Partial<Room> & { id: string; name: string }): Room {
  return {
    type: "Shared room",
    rent: 0,
    capacity: 1,
    accent: "coral",
    ...emptyRoomExtras,
    ...stored,
  } as Room;
}

/** Short badges describing a room, for cards and listings. */
export function roomHighlights(room: Room) {
  return [
    room.attachedBathroom ? "Attached bathroom" : "Shared bathroom",
    room.balcony ? "Balcony" : null,
    room.airConditioned ? "Air conditioned" : null,
    FURNISHING_LABEL[room.furnishing],
  ].filter(Boolean) as string[];
}

/** URL-safe, readable, and unique enough to be made unique by a suffix. */
export function slugify(value: string) {
  const base = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "room";
}
