import type { AvatarDocument, MemberDocument } from "@/lib/data";
import { getDb } from "@/lib/mongodb";
import { ApiError, jsonError, readSession, type UserDocument } from "@/lib/server-utils";
import { mergeVisibility } from "@/lib/visibility";

export const runtime = "nodejs";

/**
 * Serves a profile picture.
 *
 * Unlike a room photo on a published post, an avatar is never public: it goes
 * to the person themselves, and to the mess they are currently sharing with the
 * viewer. Anything else gets a 404 rather than a 403, so the response does not
 * confirm that an id exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) throw new ApiError(400, "An avatar id is required.");

    const db = await getDb();
    const avatar = await db.collection<AvatarDocument>("avatars").findOne({ id });
    if (!avatar) throw new ApiError(404, "That picture is no longer available.");

    const owner = await db
      .collection<UserDocument>("users")
      .findOne({ id: avatar.userId }, { projection: { visibility: 1 } });
    const level = mergeVisibility(owner?.visibility).avatar;

    // A public picture needs no session at all: it is shown beside its owner's
    // to-let posts, which anyone can read.
    let allowed = level === "public";
    let isSelf = false;
    if (!allowed) {
      const auth = await readSession();
      if (!auth) throw new ApiError(404, "That picture is no longer available.");
      isSelf = auth.user.id === avatar.userId;
      const messId = auth.session.activeMessId;
      const shared =
        level === "mess" && messId
          ? await db
              .collection<MemberDocument>("members")
              .findOne({ messId, userId: avatar.userId, status: "active" })
          : null;
      // "Private" leaves only the owner, and a manager is not exempt here:
      // a picture is not a contact detail the house needs.
      allowed = isSelf || Boolean(shared);
    }
    if (!allowed) throw new ApiError(404, "That picture is no longer available.");

    return new Response(Buffer.from(avatar.data, "base64"), {
      headers: {
        "Content-Type": avatar.type,
        "Content-Length": String(avatar.bytes),
        // A public picture may sit in a shared cache; anything narrower must
        // not, or two members of different messes could be served each other's.
        // Replacing a picture mints a new id, so a cached one is never stale.
        "Cache-Control": level === "public" ? "public, max-age=3600" : "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        // A picture is never markup, so never let it run as any.
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
