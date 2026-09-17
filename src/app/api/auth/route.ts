import { ensureIndexes, getDemoIdentity, type MemberDocument } from "@/lib/data";
import { after } from "next/server";
import { passwordResetEmail, welcomeEmail } from "@/lib/email-templates";
import { demoEnabled } from "@/lib/env";
import { sendMail } from "@/lib/mail";
import {
  consumeResetToken,
  createResetToken,
  markResetTokenUsed,
  RESET_TTL_MINUTES,
} from "@/lib/password-reset";
import { getDb } from "@/lib/mongodb";
import { clientKey, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import {
  ApiError,
  assertSameOrigin,
  cleanEmail,
  cleanString,
  clearSession,
  createSession,
  fakePasswordWork,
  hashPassword,
  jsonError,
  newId,
  readJsonBody,
  readSession,
  type UserDocument,
  verifyPassword,
  workspaceFor,
} from "@/lib/server-utils";
import type { AuthResponse, UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await readSession();
    if (!auth) {
      return Response.json({ user: null, workspace: null } satisfies AuthResponse);
    }
    const { db, session, user } = auth;
    const workspace =
      session.activeMessId && session.role
        ? await workspaceFor(db, user, session.activeMessId, session.role)
        : null;
    return Response.json({
      user: { id: user.id, name: user.name, email: user.email },
      workspace,
    } satisfies AuthResponse);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertSameOrigin();
    const body = await readJsonBody(request, 64 * 1024);
    const action = cleanString(body.action, "Action", 30);

    if (action === "signout") {
      await clearSession();
      return Response.json({ ok: true });
    }

    // Credential endpoints are the ones worth guessing at, so throttle by
    // caller before any database or hashing work happens. The demo is a public
    // link people share, so it gets more headroom than the password forms.
    const attemptsPerWindow: Record<string, number> = {
      signin: 10,
      signup: 6,
      demo: 30,
      forgot: 5,
      resetPassword: 8,
    };
    const throttleKey = `auth:${action}:${clientKey(request)}`;
    const limit = rateLimit(throttleKey, attemptsPerWindow[action] ?? 6, 10 * 60_000);
    if (!limit.ok) {
      throw new ApiError(429, "Too many attempts. Please wait a few minutes and try again.", {
        "Retry-After": String(limit.retryAfter),
      });
    }

    const db = await getDb();
    await ensureIndexes(db);

    if (action === "demo") {
      if (!demoEnabled()) {
        throw new ApiError(403, "Demo access is turned off on this deployment.");
      }
      const requestedRole = body.role === "admin" ? "admin" : "manager";
      const demo = await getDemoIdentity(db, requestedRole);
      await clearSession();
      await createSession(demo.user.id, demo.messId, demo.role);
      const workspace = await workspaceFor(db, demo.user, demo.messId, demo.role);
      return Response.json({
        user: { id: demo.user.id, name: demo.user.name, email: demo.user.email },
        workspace,
      } satisfies AuthResponse);
    }

    if (action === "signup") {
      const name = cleanString(body.name, "Full name", 80);
      const email = cleanEmail(body.email);
      const password = cleanString(body.password, "Password", 200);
      if (password.length < 8) throw new ApiError(400, "Use a password of at least 8 characters.");
      if (await db.collection<UserDocument>("users").findOne({ email })) {
        throw new ApiError(409, "An account with this email already exists. Try signing in.");
      }
      const credentials = await hashPassword(password);
      const user: UserDocument = {
        id: newId("user"),
        name,
        email,
        passwordHash: credentials.hash,
        passwordSalt: credentials.salt,
        isAdmin: false,
        createdAt: new Date().toISOString(),
      };
      await db.collection<UserDocument>("users").insertOne(user);
      await clearSession();
      await createSession(user.id, null, null);
      resetRateLimit(throttleKey);
      // The account already exists, so a mail server that is slow or down must
      // not hold up the response or undo the signup.
      after(async () => {
        const result = await sendMail(welcomeEmail({ to: email, name }));
        if (!result.ok) {
          console.warn(`[messmate] welcome email to ${email} was not delivered: ${result.error}`);
        }
      });
      return Response.json({ user: { id: user.id, name, email }, workspace: null } satisfies AuthResponse, {
        status: 201,
      });
    }

    if (action === "signin") {
      const email = cleanEmail(body.email);
      const password = cleanString(body.password, "Password", 200);
      const user = await db.collection<UserDocument>("users").findOne({ email });
      if (!user) {
        await fakePasswordWork();
        throw new ApiError(401, "That email and password do not match an account.");
      }
      if (!(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
        throw new ApiError(401, "That email and password do not match an account.");
      }

      // Reconnect the account to whichever mess it already belongs to.
      let role: UserRole | null = user.isAdmin ? "admin" : null;
      let activeMessId: string | null = null;
      const membership = await db
        .collection<MemberDocument>("members")
        .findOne({ userId: user.id, status: "active" });
      if (membership) {
        activeMessId = membership.messId;
        if (!user.isAdmin) role = membership.role === "Manager" ? "manager" : "member";
      }

      await clearSession();
      await createSession(user.id, activeMessId, role);
      resetRateLimit(throttleKey);
      const workspace =
        activeMessId && role ? await workspaceFor(db, user, activeMessId, role) : null;
      return Response.json({
        user: { id: user.id, name: user.name, email },
        workspace,
      } satisfies AuthResponse);
    }

    if (action === "forgot") {
      const email = cleanEmail(body.email);
      const user = await db.collection<UserDocument>("users").findOne({ email });
      if (user) {
        const token = await createResetToken(db, user.id);
        after(async () => {
          const result = await sendMail(
            passwordResetEmail({
              to: email,
              name: user.name,
              token,
              minutesValid: RESET_TTL_MINUTES,
            }),
          );
          if (!result.ok) {
            console.warn(`[messmate] reset email to ${email} was not delivered: ${result.error}`);
          }
        });
      }
      // The same answer either way, so this cannot be used to discover which
      // addresses have accounts.
      return Response.json({
        message: `If an account exists for that address, a reset link is on its way. It expires in ${RESET_TTL_MINUTES} minutes.`,
      });
    }

    if (action === "resetPassword") {
      const token = cleanString(body.token, "Reset token", 200);
      const password = cleanString(body.password, "Password", 200);
      if (password.length < 8) throw new ApiError(400, "Use a password of at least 8 characters.");

      const record = await consumeResetToken(db, token);
      if (!record) {
        throw new ApiError(400, "That reset link has expired or has already been used.");
      }
      const credentials = await hashPassword(password);
      await db
        .collection<UserDocument>("users")
        .updateOne(
          { id: record.user.id },
          { $set: { passwordHash: credentials.hash, passwordSalt: credentials.salt } },
        );
      await markResetTokenUsed(db, record.tokenHash);
      // Resetting a password ends every other session, which is the point of
      // resetting it when an account may be compromised.
      await db.collection("sessions").deleteMany({ userId: record.user.id });
      await clearSession();
      resetRateLimit(throttleKey);
      return Response.json({
        message: "Your password has been changed. You can sign in with it now.",
      });
    }

    throw new ApiError(400, "Unsupported authentication action.");
  } catch (error) {
    return jsonError(error);
  }
}
