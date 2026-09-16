import type { BazarDocument } from "@/lib/data";
import { ApiError, jsonError, requireWorkspace } from "@/lib/server-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a bazar receipt image. Proofs are stored inline with the entry, so the
 * only way to see one is through this handler, which checks that the caller is
 * in the same mess before decoding it.
 */
export async function GET(request: Request) {
  try {
    const { db, mess } = await requireWorkspace();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "A bazar entry id is required.");

    const entry = await db
      .collection<BazarDocument>("bazar")
      .findOne({ id, messId: mess.id }, { projection: { proof: 1 } });
    if (!entry?.proof?.data) throw new ApiError(404, "No receipt was attached to that entry.");

    const [header, base64] = entry.proof.data.split(",", 2);
    if (!base64) throw new ApiError(404, "That receipt could not be read.");
    const type = /^data:([^;]+);base64$/.exec(header)?.[1] ?? "application/octet-stream";

    return new Response(Buffer.from(base64, "base64"), {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `inline; filename="${encodeURIComponent(entry.proof.name)}"`,
        // Receipts belong to one mess, so they must never reach a shared cache.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
