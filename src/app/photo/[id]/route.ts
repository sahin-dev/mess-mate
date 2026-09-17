import type { ListingDocument, ListingPhotoDocument } from "@/lib/data";
import { getDb } from "@/lib/mongodb";
import { ApiError, jsonError, readSession } from "@/lib/server-utils";

export const runtime = "nodejs";

/**
 * Serves a room photo from a to-let post.
 *
 * A published post is public, so its photos are public too and may be cached
 * for an hour — long enough to be fast, short enough that taking a post down
 * removes the photos with it. A draft or a post still waiting on the manager is
 * not public, so those photos go only to someone in that mess, and never to a
 * shared cache.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) throw new ApiError(400, "A photo id is required.");

    const db = await getDb();
    const photo = await db.collection<ListingPhotoDocument>("listingPhotos").findOne({ id });
    if (!photo) throw new ApiError(404, "That photo is no longer available.");

    const listing = await db
      .collection<ListingDocument>("listings")
      .findOne({ id: photo.listingId }, { projection: { status: 1, messId: 1 } });
    if (!listing) throw new ApiError(404, "That photo is no longer available.");

    const isPublic = listing.status === "published";
    if (!isPublic) {
      const auth = await readSession();
      // A 404 rather than a 403: whether an unpublished post exists is itself
      // something only the house should know.
      if (!auth || auth.session.activeMessId !== photo.messId) {
        throw new ApiError(404, "That photo is no longer available.");
      }
    }

    return new Response(Buffer.from(photo.data, "base64"), {
      headers: {
        "Content-Type": photo.type,
        "Content-Length": String(photo.bytes),
        // Cacheable, but not for long: taking a post down has to actually
        // take the photos down, and "immutable" would leave them readable in
        // every browser that had already loaded them.
        "Cache-Control": isPublic ? "public, max-age=3600" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Belt and braces: a photo is never markup, so never let it run as any.
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
