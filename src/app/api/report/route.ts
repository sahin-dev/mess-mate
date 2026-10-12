import { createHash } from "node:crypto";
import type { ListingDocument, ListingReportDocument } from "@/lib/data";
import { getDb } from "@/lib/mongodb";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  assertSameOrigin,
  cleanEmail,
  cleanString,
  jsonError,
  newId,
  readJsonBody,
} from "@/lib/server-utils";
import type { ListingReportReason } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS: readonly ListingReportReason[] = [
  "scam",
  "unavailable",
  "misleading",
  "discriminatory",
  "offensive",
  "other",
];

/**
 * A visitor flags a public to-let post for the platform team.
 *
 * No sign-in is needed — the people most likely to spot a scam are the ones
 * browsing rooms — so it is throttled per caller and a repeat report of the
 * same post by the same caller is folded into the first.
 */
export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const caller = clientKey(request);
    const limit = rateLimit(`report:${caller}`, 5, 60 * 60_000);
    if (!limit.ok) {
      throw new ApiError(429, "You have sent several reports recently. Please try again later.", {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const body = await readJsonBody(request, 16 * 1024);
    const slug = cleanString(body.slug, "Listing", 120);
    if (typeof body.reason !== "string" || !REASONS.includes(body.reason as ListingReportReason)) {
      throw new ApiError(400, "Choose a reason for the report.");
    }
    const reason = body.reason as ListingReportReason;
    const details = typeof body.details === "string" ? body.details.trim().slice(0, 1000) : "";
    const contactRaw = typeof body.contact === "string" ? body.contact.trim() : "";
    const contact = contactRaw ? cleanEmail(contactRaw) : "";
    if (reason === "other" && !details) {
      throw new ApiError(400, "Tell us briefly what is wrong with this post.");
    }

    const db = await getDb();
    const listing = await db
      .collection<ListingDocument>("listings")
      .findOne({ slug, status: "published" }, { projection: { id: 1, messId: 1 } });
    if (!listing) throw new ApiError(404, "That post is no longer published.");

    // The raw address is never stored; the hash only recognises a repeat.
    const reporterKey = createHash("sha256").update(`${caller}:${listing.id}`).digest("hex");
    const reports = db.collection<ListingReportDocument>("listingReports");
    const already = await reports.findOne({ listingId: listing.id, reporterKey, status: "open" });
    if (!already) {
      await reports.insertOne({
        id: newId("report"),
        listingId: listing.id,
        messId: listing.messId,
        reason,
        details,
        contact,
        reporterKey,
        status: "open",
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null,
      });
    }
    return Response.json({
      ok: true,
      message: "Thank you. The MessMate team will review this post.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
