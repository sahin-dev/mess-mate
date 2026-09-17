import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import type { Db } from "mongodb";
import { isProduction, trustedOrigins } from "@/lib/env";
import { isDemoUser } from "@/lib/demo";
import { mergeVisibility } from "@/lib/visibility";
import { getDb } from "@/lib/mongodb";
import type { ProfileVisibility, UserRole, Workspace } from "@/lib/types";

export const SESSION_COOKIE = "messmate_session";
const SESSION_DAYS = 30;
const SCRYPT_KEYLEN = 64;

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export type UserDocument = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  isAdmin: boolean;
  createdAt: string;
  /** Optional, and only ever shown to the rest of that person's own mess. */
  phone?: string;
  /** Points at an `avatars` document, or absent when initials are used. */
  avatarId?: string | null;
  /** Who can see the picture, address and phone. Absent means the defaults. */
  visibility?: Partial<ProfileVisibility>;
  /** Last time this account made a request. Absent until they next visit. */
  lastSeenAt?: string;
  updatedAt?: string;
};

export type SessionDocument = {
  token: string;
  userId: string;
  activeMessId: string | null;
  role: UserRole | null;
  expiresAt: Date;
  createdAt: Date;
};

export type MessDocument = {
  id: string;
  name: string;
  location: string;
  joinCode: string;
  expectedMembers: number;
  managerId: string;
  createdAt: string;
  settings: Record<string, unknown>;
  /** Both added later, so both are optional on stored documents. */
  property?: Record<string, unknown>;
  facilities?: unknown[];
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export function cleanString(value: unknown, field: string, max = 120) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required.`);
  }
  return value.trim().slice(0, max);
}

export function cleanEmail(value: unknown) {
  const email = cleanString(value, "Email", 180).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address.");
  }
  return email;
}

export function cleanNumber(value: unknown, field: string, min = 0, max = 10_000_000) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, `${field} must be between ${min} and ${max}.`);
  }
  return number;
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
  }
  // Never forward an internal message to the client; log it for correlation.
  console.error("[messmate] unhandled request error", error);
  return Response.json(
    { error: "Something went wrong on our side. Please try again." },
    { status: 500 },
  );
}

/** Reads and size-limits a JSON body. Route handlers accept objects only. */
export async function readJsonBody(request: Request, maxBytes = 8 * 1024 * 1024) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError(413, "That request is too large.");
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, "That request is too large.");
  try {
    const parsed = JSON.parse(text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "The request body could not be read.");
  }
}

/**
 * Defence in depth against cross-site requests. The session cookie is already
 * `SameSite=Lax`, which blocks cross-site POSTs in current browsers; this also
 * rejects anything that arrives with a foreign `Origin`.
 */
export async function assertSameOrigin() {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (!origin) return; // Same-origin form posts and server-side calls send none.
  const host = headerList.get("host");
  const allowed = new Set(trustedOrigins());
  if (host) {
    allowed.add(`https://${host}`);
    if (!isProduction()) allowed.add(`http://${host}`);
  }
  if (!allowed.has(origin)) {
    throw new ApiError(403, "This request was blocked because it came from another site.");
  }
}

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return { salt, hash: hash.toString("hex") };
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  const actual = Buffer.from((await hashPassword(password, salt)).hash, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

/**
 * Burns the same amount of work as a real password check, so a missing account
 * cannot be distinguished from a wrong password by response time alone.
 */
export async function fakePasswordWork() {
  await scryptAsync("decoy", "messmate-decoy-salt", SCRYPT_KEYLEN);
}

/** Join codes skip characters that are easy to misread when shared by hand. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createJoinCode(name: string) {
  const prefix =
    name
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase() || "MESS";
  const random = Array.from(randomBytes(4))
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join("");
  return `${prefix}-${random}`;
}

export async function createSession(
  userId: string,
  activeMessId: string | null,
  role: UserRole | null,
) {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .collection<SessionDocument>("sessions")
    .insertOne({ token, userId, activeMessId, role, expiresAt, createdAt: new Date() });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.collection<SessionDocument>("sessions").deleteOne({ token });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Resolves the session without throwing — for pages that branch on sign-in state. */
export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const session = await db
    .collection<SessionDocument>("sessions")
    .findOne({ token, expiresAt: { $gt: new Date() } });
  if (!session) return null;
  const user = await db.collection<UserDocument>("users").findOne({ id: session.userId });
  if (!user) return null;
  await touchLastSeen(db, user);
  return { db, session, user };
}

/** How stale `lastSeenAt` may get before a request writes a fresh one. */
const LAST_SEEN_INTERVAL_MS = 15 * 60_000;

/**
 * Records that this account is in use, for the admin dashboard's active-user
 * figures. Nothing else in the app stores when a person last did something: a
 * meal carries the date it is *for*, which someone can set days ahead.
 *
 * Written at most once every fifteen minutes per account, so the common case is
 * a comparison against a document that has already been loaded, and a page made
 * of many requests still costs one small write at most.
 */
async function touchLastSeen(db: Db, user: UserDocument) {
  const now = Date.now();
  const seen = user.lastSeenAt ? Date.parse(user.lastSeenAt) : 0;
  if (Number.isFinite(seen) && now - seen < LAST_SEEN_INTERVAL_MS) return;
  const lastSeenAt = new Date(now).toISOString();
  // A failure here must never sign anybody out — it is only a statistic.
  await db
    .collection<UserDocument>("users")
    .updateOne({ id: user.id }, { $set: { lastSeenAt } })
    .catch(() => undefined);
  user.lastSeenAt = lastSeenAt;
}

export async function requireSession() {
  const auth = await readSession();
  if (!auth) throw new ApiError(401, "Please sign in to continue.");
  return auth;
}

export async function requireWorkspace() {
  const auth = await requireSession();
  if (!auth.session.activeMessId || !auth.session.role) {
    throw new ApiError(409, "Create or join a mess before using this feature.");
  }
  const mess = await auth.db
    .collection<MessDocument>("messes")
    .findOne({ id: auth.session.activeMessId });
  if (!mess) throw new ApiError(404, "Workspace not found.");
  return { ...auth, mess, role: auth.session.role };
}

export function requireManager(role: UserRole) {
  if (role !== "manager" && role !== "admin") {
    throw new ApiError(403, "Only a mess manager can do that.");
  }
}

export async function workspaceFor(
  db: Db,
  user: UserDocument,
  messId: string,
  role: UserRole,
): Promise<Workspace> {
  const mess = await db.collection<MessDocument>("messes").findOne({ id: messId });
  if (!mess) throw new ApiError(404, "Workspace not found.");
  const memberCount = await db.collection("members").countDocuments({ messId, status: "active" });
  return {
    role,
    messId,
    messName: mess.name,
    location: mess.location,
    joinCode: mess.joinCode,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    userPhone: user.phone ?? "",
    isDemo: isDemoUser(user.id),
    userVisibility: mergeVisibility(user.visibility),
    userAvatarId: user.avatarId ?? null,
    memberCount,
  };
}

export async function setActiveWorkspace(
  db: Db,
  session: SessionDocument,
  messId: string,
  role: UserRole,
) {
  await db
    .collection<SessionDocument>("sessions")
    .updateOne({ token: session.token }, { $set: { activeMessId: messId, role } });
}

/**
 * Connects a session to whichever mess the user actually belongs to.
 *
 * A manager approving a request updates that user's sessions, but someone who
 * signed in earlier, or on another device, still arrives with no active mess.
 * Returns the membership if there is one.
 */
export async function adoptMembership(
  db: Db,
  session: SessionDocument,
  user: UserDocument,
) {
  if (session.activeMessId && session.role) return null;
  const membership = await db
    .collection<{ messId: string; role: string; status: string; userId: string | null }>("members")
    .findOne({ userId: user.id, status: "active" });
  if (!membership) return null;
  const role: UserRole = membership.role === "Manager" ? "manager" : "member";
  await setActiveWorkspace(db, session, membership.messId, role);
  return { messId: membership.messId, role };
}

/** The mess this user has asked to join, if a manager has yet to decide. */
export async function pendingJoinRequest(db: Db, user: UserDocument) {
  const request = await db
    .collection<{ messId: string; joinedAt: string }>("members")
    .findOne({ userId: user.id, status: "requested" });
  if (!request) return null;
  const mess = await db.collection<MessDocument>("messes").findOne({ id: request.messId });
  if (!mess) return null;
  return {
    messId: mess.id,
    messName: mess.name,
    location: mess.location,
    requestedAt: request.joinedAt,
  };
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}
