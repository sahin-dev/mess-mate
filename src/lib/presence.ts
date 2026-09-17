/**
 * Who is on the site right now.
 *
 * An open tab says so once a minute while it is visible, and stops the moment
 * it is hidden or closed. "Online" is therefore "said so recently" — a window
 * of two ping intervals, so one dropped request does not make somebody blink
 * out and reappear.
 *
 * This is deliberately not a socket. A socket's advantage is noticing a
 * disconnect instantly; at a minute's resolution an admin dashboard cannot tell
 * the difference, and this costs no held connections and no custom server.
 */

/** How often a visible tab reports in. */
export const PRESENCE_PING_MS = 60_000;

/** How long a report counts for. Two intervals, to survive one lost ping. */
export const PRESENCE_WINDOW_MS = 2 * PRESENCE_PING_MS;

/**
 * The server ignores reports closer together than this, so a misbehaving or
 * duplicated client cannot turn presence into a write loop.
 */
export const PRESENCE_MIN_WRITE_MS = 30_000;
