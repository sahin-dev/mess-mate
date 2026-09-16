import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/mail";

/**
 * Only the community pages are meant to be found. Everything else is a private
 * workspace, and the API returns nothing useful without a session cookie.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    // "/$" matches the landing page only; everything else stays private.
    rules: [{ userAgent: "*", allow: ["/$", "/community"], disallow: ["/"] }],
    sitemap: appUrl("/sitemap.xml"),
  };
}
