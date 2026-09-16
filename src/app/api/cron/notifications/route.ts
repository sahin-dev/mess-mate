import { timingSafeEqual } from "node:crypto";
import { isProduction } from "@/lib/env";
import { getDb } from "@/lib/mongodb";
import { jsonError } from "@/lib/server-utils";
import { runNotifications } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reminders for many messes can take a while; ask the platform for more time.
export const maxDuration = 300;

/**
 * Scheduled reminders. Point an hourly scheduler at this endpoint:
 *
 *   curl -X POST https://your-host/api/cron/notifications \
 *        -H "Authorization: Bearer $MESSMATE_CRON_SECRET"
 *
 * Running it more often is harmless: each reminder is claimed once per member
 * per day, so repeats send nothing.
 */
function authorized(request: Request) {
  const secret = process.env.MESSMATE_CRON_SECRET?.trim();
  // Without a configured secret the endpoint is open, which is only ever
  // acceptable on a developer machine.
  if (!secret) return !isProduction();

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(offered);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request) {
  try {
    if (!authorized(request)) {
      return Response.json({ error: "Not authorized." }, { status: 401 });
    }
    const started = Date.now();
    const result = await runNotifications(await getDb());
    return Response.json(
      { ...result, tookMs: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export const POST = handle;
// GET as well, because several hosted schedulers can only issue GET requests.
export const GET = handle;
