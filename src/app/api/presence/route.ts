import { getDb } from "@/lib/mongodb";
import { PRESENCE_MIN_WRITE_MS } from "@/lib/presence";
import { ApiError, assertSameOrigin, jsonError, readSession, type UserDocument } from "@/lib/server-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "I am still here."
 *
 * Deliberately the smallest endpoint in the app: one indexed write, no body to
 * parse and nothing read back. An open tab calls it once a minute, so the cost
 * has to stay flat in the number of people looking at the site.
 */
export async function POST() {
  try {
    await assertSameOrigin();
    const auth = await readSession();
    // Not signed in is not an error worth logging: a tab left open across a
    // sign-out will hit this, and it simply stops counting.
    if (!auth) throw new ApiError(401, "Not signed in.");

    const now = Date.now();
    const seen = auth.user.lastSeenAt ? Date.parse(auth.user.lastSeenAt) : 0;
    // readSession has its own, much lazier, touch. Skipping here when that has
    // just run keeps a reload from writing twice.
    if (!Number.isFinite(seen) || now - seen >= PRESENCE_MIN_WRITE_MS) {
      const db = await getDb();
      await db
        .collection<UserDocument>("users")
        .updateOne({ id: auth.user.id }, { $set: { lastSeenAt: new Date(now).toISOString() } });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
