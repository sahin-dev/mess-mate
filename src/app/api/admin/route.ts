import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { AnnouncementDocument, ListingDocument, ListingReportDocument } from "@/lib/data";
import { isDemoUser } from "@/lib/demo";
import { passwordResetEmail } from "@/lib/email-templates";
import { sendMail } from "@/lib/mail";
import { createResetToken, RESET_TTL_MINUTES } from "@/lib/password-reset";
import {
  announcementState,
  listActivity,
  listAnnouncements,
  listAudit,
  listListings,
  listMesses,
  listReports,
  listUsers,
  loadHealth,
  loadOverview,
  messDetail,
  pageNumber,
  recordAudit,
  userDetail,
} from "@/lib/admin";
import { rateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  assertSameOrigin,
  cleanString,
  jsonError,
  newId,
  readJsonBody,
  requireSession,
  type MessDocument,
  type UserDocument,
} from "@/lib/server-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const auth = await requireSession();
  if (!auth.user.isAdmin) throw new ApiError(403, "Platform administrator access is required.");
  return auth;
}

const optionalText = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** An ISO timestamp from a `datetime-local` value or a full ISO string. */
function isoOrNull(value: unknown, field: string) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, `${field} is invalid.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ApiError(400, `${field} is invalid.`);
  return parsed.toISOString();
}

export async function GET(request: Request) {
  try {
    const { db, user } = await requireAdmin();
    const params = new URL(request.url).searchParams;
    const view = params.get("view") ?? "overview";
    const query = params.get("q") ?? "";
    const filter = params.get("filter") ?? "All";
    const page = pageNumber(params.get("page"));
    const id = params.get("id") ?? "";

    switch (view) {
      case "overview":
        return Response.json(await loadOverview(db));
      case "users":
        return Response.json(await listUsers(db, user.id, query, filter, page));
      case "user": {
        const detail = await userDetail(db, user.id, id);
        if (!detail) throw new ApiError(404, "That account no longer exists.");
        return Response.json(detail);
      }
      case "messes":
        return Response.json(await listMesses(db, query, filter, page));
      case "mess": {
        const detail = await messDetail(db, id);
        if (!detail) throw new ApiError(404, "That mess no longer exists.");
        return Response.json(detail);
      }
      case "listings":
        return Response.json(await listListings(db, query, filter, page));
      case "reports":
        return Response.json(await listReports(db, filter, page));
      case "activity":
        return Response.json(await listActivity(db, query, page));
      case "announcements":
        return Response.json({ rows: await listAnnouncements(db) });
      case "audit":
        return Response.json(await listAudit(db, query, page));
      case "health":
        return Response.json(await loadHealth(db));
      default:
        throw new ApiError(400, "Unknown admin view.");
    }
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const { db, user } = await requireAdmin();
    const limit = rateLimit(`admin:${user.id}`, 60, 60_000);
    if (!limit.ok) {
      throw new ApiError(429, "Too many changes at once. Please wait a moment.", {
        "Retry-After": String(limit.retryAfter),
      });
    }
    const body = await readJsonBody(request, 64 * 1024);
    const action = cleanString(body.action, "Action", 40);
    const users = db.collection<UserDocument>("users");
    const messes = db.collection<MessDocument>("messes");
    const listings = db.collection<ListingDocument>("listings");
    const reports = db.collection<ListingReportDocument>("listingReports");
    const announcements = db.collection<AnnouncementDocument>("announcements");
    const now = new Date().toISOString();

    /** Loads an account an administrator is about to act on, with the guards every action shares. */
    const targetUser = async (options: { allowSelf?: boolean } = {}) => {
      const id = cleanString(body.id, "Account", 100);
      const account = await users.findOne({ id });
      if (!account) throw new ApiError(404, "That account no longer exists.");
      if (!options.allowSelf && account.id === user.id) {
        throw new ApiError(409, "You cannot do that to your own account.");
      }
      if (isDemoUser(account.id)) {
        throw new ApiError(409, "The shared demo accounts cannot be changed.");
      }
      return account;
    };

    switch (action) {
      case "suspendUser": {
        const account = await targetUser();
        const reason = cleanString(body.reason, "Reason", 300);
        if (account.isAdmin) {
          throw new ApiError(409, "Remove administrator access before suspending this account.");
        }
        await users.updateOne({ id: account.id }, { $set: { suspendedAt: now, suspendedReason: reason } });
        // Suspension takes effect at once, on every device.
        await db.collection("sessions").deleteMany({ userId: account.id });
        await recordAudit(db, user, {
          action: "Suspended account",
          targetType: "user",
          targetId: account.id,
          targetLabel: `${account.name} <${account.email}>`,
          detail: reason,
        });
        return Response.json({ ok: true, message: `${account.name} is suspended and signed out everywhere.` });
      }

      case "restoreUser": {
        const account = await targetUser();
        if (!account.suspendedAt) throw new ApiError(409, "That account is not suspended.");
        await users.updateOne({ id: account.id }, { $set: { suspendedAt: null }, $unset: { suspendedReason: "" } });
        await recordAudit(db, user, {
          action: "Restored account",
          targetType: "user",
          targetId: account.id,
          targetLabel: `${account.name} <${account.email}>`,
          detail: optionalText(body.reason, 300),
        });
        return Response.json({ ok: true, message: `${account.name} can sign in again.` });
      }

      case "revokeSessions": {
        const account = await targetUser();
        const result = await db.collection("sessions").deleteMany({ userId: account.id });
        await recordAudit(db, user, {
          action: "Signed out everywhere",
          targetType: "user",
          targetId: account.id,
          targetLabel: `${account.name} <${account.email}>`,
          detail: `${result.deletedCount} ${result.deletedCount === 1 ? "session" : "sessions"} ended`,
        });
        return Response.json({
          ok: true,
          message: `Ended ${result.deletedCount} ${result.deletedCount === 1 ? "session" : "sessions"} for ${account.name}.`,
        });
      }

      case "setAdmin": {
        const account = await targetUser();
        const grant = body.admin === true;
        if (grant && account.suspendedAt) {
          throw new ApiError(409, "Restore this account before giving it administrator access.");
        }
        if (!grant) {
          const admins = await users.countDocuments({ isAdmin: true, suspendedAt: { $not: { $type: "string" } } });
          if (admins <= 1) throw new ApiError(409, "The platform needs at least one administrator.");
        }
        await users.updateOne({ id: account.id }, { $set: { isAdmin: grant } });
        // A session carries the role it was opened with, so it is ended rather
        // than left holding access it should no longer have (or lacking it).
        await db.collection("sessions").deleteMany({ userId: account.id });
        await recordAudit(db, user, {
          action: grant ? "Granted administrator access" : "Removed administrator access",
          targetType: "user",
          targetId: account.id,
          targetLabel: `${account.name} <${account.email}>`,
          detail: "",
        });
        return Response.json({
          ok: true,
          message: grant
            ? `${account.name} is now a platform administrator.`
            : `${account.name} is no longer a platform administrator.`,
        });
      }

      case "sendPasswordReset": {
        const account = await targetUser();
        if (account.suspendedAt) throw new ApiError(409, "Restore this account before sending a reset link.");
        const token = await createResetToken(db, account.id);
        after(async () => {
          const result = await sendMail(
            passwordResetEmail({ to: account.email, name: account.name, token, minutesValid: RESET_TTL_MINUTES }),
          );
          if (!result.ok) {
            console.warn(`[messmate] admin reset email to ${account.email} was not delivered: ${result.error}`);
          }
        });
        await recordAudit(db, user, {
          action: "Sent password reset",
          targetType: "user",
          targetId: account.id,
          targetLabel: `${account.name} <${account.email}>`,
          detail: "",
        });
        return Response.json({ ok: true, message: `A reset link is on its way to ${account.email}.` });
      }

      case "suspendMess":
      case "restoreMess": {
        const id = cleanString(body.id, "Mess", 100);
        const mess = await messes.findOne({ id });
        if (!mess) throw new ApiError(404, "That mess no longer exists.");
        const suspend = action === "suspendMess";
        const reason = suspend ? cleanString(body.reason, "Reason", 300) : optionalText(body.reason, 300);
        if (suspend === Boolean(mess.suspendedAt)) {
          throw new ApiError(409, suspend ? "That mess is already suspended." : "That mess is not suspended.");
        }
        await messes.updateOne(
          { id },
          suspend
            ? { $set: { suspendedAt: now, suspendedReason: reason } }
            : { $set: { suspendedAt: null }, $unset: { suspendedReason: "" } },
        );
        // Its public posts disappear or return with it.
        const published = await listings.find({ messId: id, status: "published" }, { projection: { slug: 1 } }).toArray();
        if (published.length) {
          revalidatePath("/community");
          for (const listing of published) revalidatePath(`/community/${listing.slug}`);
        }
        await recordAudit(db, user, {
          action: suspend ? "Suspended mess" : "Restored mess",
          targetType: "mess",
          targetId: id,
          targetLabel: mess.name,
          detail: reason,
        });
        return Response.json({
          ok: true,
          message: suspend ? `${mess.name} is now read-only.` : `${mess.name} is active again.`,
        });
      }

      case "takeDownListing":
      case "allowListing": {
        const id = cleanString(body.id, "Listing", 100);
        const listing = await listings.findOne({ id });
        if (!listing) throw new ApiError(404, "That post no longer exists.");
        const takeDown = action === "takeDownListing";
        const reason = takeDown ? cleanString(body.reason, "Reason", 300) : "";
        await listings.updateOne(
          { id },
          takeDown
            ? { $set: { status: "draft", moderation: { removedAt: now, reason }, updatedAt: now } }
            : { $set: { moderation: null, updatedAt: now } },
        );
        if (takeDown) {
          // Taking a post down settles every open report against it.
          await reports.updateMany(
            { listingId: id, status: "open" },
            { $set: { status: "actioned", resolvedAt: now, resolvedBy: user.name } },
          );
        }
        revalidatePath("/community");
        revalidatePath(`/community/${listing.slug}`);
        await recordAudit(db, user, {
          action: takeDown ? "Took down listing" : "Allowed listing again",
          targetType: "listing",
          targetId: id,
          targetLabel: listing.title || listing.slug,
          detail: reason,
        });
        return Response.json({
          ok: true,
          message: takeDown
            ? "The post is down. Its manager sees why, and cannot republish it."
            : "The manager can publish this post again.",
        });
      }

      case "resolveReport": {
        const id = cleanString(body.id, "Report", 100);
        const outcome = body.outcome === "actioned" ? "actioned" : "dismissed";
        const report = await reports.findOne({ id });
        if (!report) throw new ApiError(404, "That report no longer exists.");
        await reports.updateOne({ id }, { $set: { status: outcome, resolvedAt: now, resolvedBy: user.name } });
        await recordAudit(db, user, {
          action: outcome === "actioned" ? "Marked report actioned" : "Dismissed report",
          targetType: "report",
          targetId: report.listingId,
          targetLabel: `Report on ${report.listingId}`,
          detail: report.reason,
        });
        return Response.json({ ok: true, message: outcome === "actioned" ? "Report closed." : "Report dismissed." });
      }

      case "saveAnnouncement": {
        const title = cleanString(body.title, "Title", 120);
        const text = optionalText(body.body, 600);
        const tone = body.tone === "warning" || body.tone === "success" ? body.tone : "info";
        const audience = body.audience === "managers" ? "managers" : "everyone";
        const startsAt = isoOrNull(body.startsAt, "Start") ?? now;
        const endsAt = isoOrNull(body.endsAt, "End");
        if (endsAt && endsAt <= startsAt) throw new ApiError(400, "The end has to come after the start.");
        const id = typeof body.id === "string" && body.id ? body.id : null;
        if (id) {
          const result = await announcements.updateOne(
            { id },
            { $set: { title, body: text, tone, audience, startsAt, endsAt, updatedAt: now } },
          );
          if (!result.matchedCount) throw new ApiError(404, "That announcement no longer exists.");
        } else {
          await announcements.insertOne({
            id: newId("announcement"),
            title,
            body: text,
            tone,
            audience,
            startsAt,
            endsAt,
            createdAt: now,
            updatedAt: now,
            createdBy: user.name,
            createdById: user.id,
          });
        }
        await recordAudit(db, user, {
          action: id ? "Edited announcement" : "Published announcement",
          targetType: "announcement",
          targetId: id,
          targetLabel: title,
          detail: `${audience === "managers" ? "Managers" : "Everyone"} · ${announcementState({ startsAt, endsAt }, now)}`,
        });
        return Response.json({ ok: true, message: id ? "Announcement updated." : "Announcement saved." });
      }

      case "endAnnouncement":
      case "deleteAnnouncement": {
        const id = cleanString(body.id, "Announcement", 100);
        const row = await announcements.findOne({ id });
        if (!row) throw new ApiError(404, "That announcement no longer exists.");
        if (action === "endAnnouncement") {
          await announcements.updateOne({ id }, { $set: { endsAt: now, updatedAt: now } });
        } else {
          await announcements.deleteOne({ id });
        }
        await recordAudit(db, user, {
          action: action === "endAnnouncement" ? "Ended announcement" : "Deleted announcement",
          targetType: "announcement",
          targetId: id,
          targetLabel: row.title,
          detail: "",
        });
        return Response.json({
          ok: true,
          message: action === "endAnnouncement" ? "Announcement ended." : "Announcement deleted.",
        });
      }

      default:
        throw new ApiError(400, "Unsupported admin action.");
    }
  } catch (error) {
    return jsonError(error);
  }
}
