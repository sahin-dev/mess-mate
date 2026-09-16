import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/mail";
import { getDb } from "@/lib/mongodb";
import { loadPublishedListings } from "@/lib/public-listings";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const index = [
    { url: appUrl("/"), changeFrequency: "weekly" as const, priority: 1 },
    { url: appUrl("/community"), changeFrequency: "daily" as const, priority: 0.9 },
  ];
  try {
    const listings = await loadPublishedListings(await getDb(), 500);
    return [
      ...index,
      ...listings.map((listing) => ({
        url: appUrl(`/community/${listing.slug}`),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // A sitemap with just the public pages beats a 500 while the database is away.
    return index;
  }
}
