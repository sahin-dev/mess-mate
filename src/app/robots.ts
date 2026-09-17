import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/mail";

/**
 * Only the community pages are meant to be found. Everything else is a private
 * workspace, and the API returns nothing useful without a session cookie.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    // "/$" matches the landing page only; everything else stays private.
    // /photo serves the images those community pages reference.
    rules: [{ userAgent: "*", allow: ["/$", "/community", "/photo"], disallow: ["/"] }],
    sitemap: appUrl("/sitemap.xml"),
  };
}
