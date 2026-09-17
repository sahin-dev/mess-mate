/**
 * Profile pictures.
 *
 * Shared by the browser (which squares and shrinks a photo before sending) and
 * the route that stores it, so the two cannot drift apart on what "too large"
 * means.
 */

/** Stored square. Enough for a retina 96px avatar, which is the largest use. */
export const AVATAR_EDGE = 256;
export const AVATAR_QUALITY = 0.85;
/** After the browser has resized. A 256px JPEG lands an order below this. */
export const MAX_AVATAR_BYTES = 400_000;

/**
 * Where an avatar is served from.
 *
 * Outside /api on purpose: everything under there is blanket no-store for the
 * signed-in workspace, and an avatar is worth caching in the one browser that
 * is allowed to see it.
 */
export function avatarUrl(id: string) {
  return `/avatar/${id}`;
}
