import { performance } from "node:perf_hooks";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for load balancers and uptime checks. It reports
 * whether the database actually answers, and never reveals the connection
 * string or an internal error message.
 */
export async function GET() {
  const started = performance.now();
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return Response.json(
      {
        status: "ok",
        database: "connected",
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        time: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[messmate] health check failed", error);
    return Response.json(
      { status: "error", database: "unreachable", time: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
