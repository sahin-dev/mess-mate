import { rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  cleanEmail,
  jsonError,
  requireManager,
  requireWorkspace,
  type UserDocument,
} from "@/lib/server-utils";
import type { MemberDocument } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exact email lookup for a signed-in mess manager, never a public directory. */
export async function GET(request: Request) {
  try {
    const { db, user, mess, role } = await requireWorkspace();
    requireManager(role);
    const limit = rateLimit(`member-lookup:${user.id}`, 20, 60_000);
    if (!limit.ok) {
      throw new ApiError(429, "Too many searches. Try again shortly.", {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const email = cleanEmail(new URL(request.url).searchParams.get("email"));
    const account = await db.collection<UserDocument>("users").findOne(
      { email },
      { projection: { id: 1, name: 1, email: 1, suspendedAt: 1 } },
    );
    const members = db.collection<MemberDocument>("members");
    const membership = (account
      ? await members.findOne({ messId: mess.id, userId: account.id })
      : null) ?? await members.findOne({ messId: mess.id, email });
    const activeElsewhere = account
      ? await members.findOne({
          userId: account.id,
          status: "active",
          messId: { $ne: mess.id },
        })
      : null;
    return Response.json({
      email,
      found: Boolean(account),
      name: account?.name ?? null,
      available: !account?.suspendedAt && !activeElsewhere && (!membership || membership.status === "former"),
      reason: account?.suspendedAt
        ? "This account cannot receive an invitation."
        : activeElsewhere
          ? "This person already belongs to another mess."
          : membership?.status === "requested"
            ? "This person already requested to join. Review their request above."
            : membership && membership.status !== "former"
              ? "This person is already a member or invited."
              : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
