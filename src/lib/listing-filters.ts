import type { ListingFilters } from "@/lib/public-listings";

/** Turns `?where=&maxRent=&seats=&features=` into filters the loader understands. */
export function listingFiltersFrom(
  params: Record<string, string | undefined>,
): ListingFilters {
  const features = new Set((params.features ?? "").split(",").filter(Boolean));
  return {
    where: params.where?.trim().slice(0, 120),
    maxRent:
      Number(params.maxRent) > 0 && Number(params.maxRent) <= 10_000_000
        ? Number(params.maxRent)
        : undefined,
    seats:
      Number.isInteger(Number(params.seats)) && Number(params.seats) > 0 && Number(params.seats) <= 20
        ? Number(params.seats)
        : undefined,
    attachedBathroom: features.has("bath"),
    balcony: features.has("balcony"),
    airConditioned: features.has("ac"),
  };
}

/** True when the visitor has narrowed the list, so an empty result can say why. */
export const isSearching = (params: Record<string, string | undefined>) =>
  Boolean(params.where || params.maxRent || params.seats || params.features);
