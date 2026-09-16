import type { ListingFilters } from "@/lib/public-listings";

/** Turns `?where=&maxRent=&seats=&features=` into filters the loader understands. */
export function listingFiltersFrom(
  params: Record<string, string | undefined>,
): ListingFilters {
  const features = new Set((params.features ?? "").split(",").filter(Boolean));
  return {
    where: params.where,
    maxRent: Number(params.maxRent) || undefined,
    seats: Number(params.seats) || undefined,
    attachedBathroom: features.has("bath"),
    balcony: features.has("balcony"),
    airConditioned: features.has("ac"),
  };
}

/** True when the visitor has narrowed the list, so an empty result can say why. */
export const isSearching = (params: Record<string, string | undefined>) =>
  Boolean(params.where || params.maxRent || params.seats || params.features);
