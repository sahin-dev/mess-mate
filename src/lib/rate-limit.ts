/**
 * A fixed-window rate limiter held in process memory.
 *
 * This is deliberately simple: it protects a single instance against password
 * guessing and accidental request storms. Behind more than one instance, or on
 * a platform that recycles instances often, move the counters to Redis or an
 * equivalent shared store — the call sites do not need to change.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: boolean; retryAfter: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/** Clears a bucket after a successful attempt, so honest users are never throttled. */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}

/**
 * Best-effort client address. Proxy headers are spoofable, so this identifies
 * callers for throttling only — never for authorization.
 */
export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
