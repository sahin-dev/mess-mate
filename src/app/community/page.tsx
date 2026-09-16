import type { Metadata } from "next";
import { getDb } from "@/lib/mongodb";
import { isSearching, listingFiltersFrom } from "@/lib/listing-filters";
import {
  loadListingAreas,
  loadPublishedListings,
  type PublicListingCard,
} from "@/lib/public-listings";
import { ListingCard } from "@/components/listing-card";
import { ListingSearch } from "@/components/listing-search";

export const metadata: Metadata = {
  title: "Rooms available in shared homes",
  description:
    "Browse rooms to let in shared homes, with the real monthly cost of living there: rent, food and bills, taken from each house's own records.",
  alternates: { canonical: "/community" },
  openGraph: {
    title: "Rooms available in shared homes | MessMate",
    description: "Rooms to let, with the real monthly cost of living there.",
    type: "website",
  },
};

// Search terms arrive as query params, so this is resolved per request.
export const dynamic = "force-dynamic";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  let listings: PublicListingCard[] = [];
  let areas: { area: string; count: number }[] = [];
  let failed = false;
  try {
    const db = await getDb();
    [listings, areas] = await Promise.all([
      loadPublishedListings(db, 60, listingFiltersFrom(params)),
      loadListingAreas(db),
    ]);
  } catch {
    // A public page should degrade rather than 500 when the database is away.
    failed = true;
  }

  return (
    <div className="public-page">
      <section className="public-hero">
        <h1>Rooms in shared homes</h1>
        <p>
          Every listing shows what living there actually costs &mdash; rent, food and bills &mdash;
          worked out from the house&rsquo;s own records, not an estimate.
        </p>
      </section>

      {!failed && <ListingSearch areas={areas} resultCount={listings.length} />}

      {failed ? (
        <p className="public-empty">Listings are unavailable right now. Please try again shortly.</p>
      ) : listings.length === 0 ? (
        <p className="public-empty">
          {isSearching(params)
            ? "No rooms match that search yet. Try a wider area, or clear the filters."
            : "No rooms are listed at the moment. If you run a mess, you can advertise a free room from your own dashboard."}
        </p>
      ) : (
        <ul className="listing-grid">
          {listings.map((listing) => (
            <li key={listing.slug}>
              <ListingCard listing={listing} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
