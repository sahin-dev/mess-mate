import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSearching, listingFiltersFrom } from "@/lib/listing-filters";
import { getDb } from "@/lib/mongodb";
import {
  loadListingAreas,
  loadPublishedListings,
  type PublicListingCard,
} from "@/lib/public-listings";
import { adoptMembership, pendingJoinRequest, readSession } from "@/lib/server-utils";
import { JoinFlow } from "@/components/join-flow";

export const metadata: Metadata = { title: "Find a room or a mess" };
export const dynamic = "force-dynamic";

/**
 * Where a signed-in person lands when they are not in a mess yet.
 *
 * Most people arriving here are looking for somewhere to live, so the page
 * leads with rooms to let; joining with a code and creating a house sit
 * underneath for the people who already know which they want.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await readSession();
  if (!auth) redirect("/signin");
  if (auth.user.isAdmin) redirect("/admin");
  if (auth.session.activeMessId && auth.session.role) redirect("/dashboard");

  // A manager may have accepted since this session started.
  if (await adoptMembership(auth.db, auth.session, auth.user)) redirect("/dashboard");

  const params = await searchParams;
  const pending = await pendingJoinRequest(auth.db, auth.user);

  let listings: PublicListingCard[] = [];
  let areas: { area: string; count: number }[] = [];
  try {
    const db = await getDb();
    [listings, areas] = await Promise.all([
      loadPublishedListings(db, 24, listingFiltersFrom(params)),
      loadListingAreas(db),
    ]);
  } catch {
    // Someone who cannot see listings can still join with a code.
  }

  return (
    <JoinFlow
      userName={auth.user.name}
      pending={pending}
      listings={listings}
      areas={areas}
      searching={isSearching(params)}
    />
  );
}
