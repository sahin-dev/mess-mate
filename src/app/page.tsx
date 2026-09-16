import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { loadPublishedListings, type PublicListingCard } from "@/lib/public-listings";
import { readSession } from "@/lib/server-utils";
import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "MessMate — settle your shared home in minutes",
  description:
    "Track meals, bazar runs and shared bills for your mess. MessMate works out the meal rate and exactly who owes whom, so month-end takes minutes instead of an evening.",
  alternates: { canonical: "/" },
  // The landing page is the one part of the private app meant to be found.
  robots: { index: true, follow: true },
  openGraph: {
    title: "MessMate — settle your shared home in minutes",
    description:
      "Meals, bazar and bills for shared homes, with the maths done for you.",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

export default async function RootPage() {
  // Someone already signed in wants their mess, not the sales pitch.
  const auth = await readSession().catch(() => null);
  if (auth) {
    if (auth.user.isAdmin) redirect("/admin");
    redirect(auth.session.activeMessId && auth.session.role ? "/dashboard" : "/join");
  }

  let listings: PublicListingCard[] = [];
  try {
    listings = await loadPublishedListings(await getDb(), 6);
  } catch {
    // The landing page must still render when the database is unreachable.
  }
  return <LandingPage listings={listings} />;
}
