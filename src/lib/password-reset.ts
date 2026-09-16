import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "mongodb";
import type { UserDocument } from "@/lib/server-utils";

/**
 * Password reset tokens.
 *
 * Only a SHA-256 hash of the token is stored, so a leaked database dump cannot
 * be used to take over accounts. The token itself exists in exactly two places:
 * the link in the recipient's inbox, and memory for the length of one request.
 */

export const RESET_TTL_MINUTES = 45;

export type ResetTokenDocument = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function ensureResetIndexes(db: Db) {
  await Promise.all([
    db.collection<ResetTokenDocument>("passwordResets").createIndex({ tokenHash: 1 }, { unique: true }),
    // Mongo removes expired tokens on its own, so nothing has to sweep them.
    db.collection<ResetTokenDocument>("passwordResets").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<ResetTokenDocument>("passwordResets").createIndex({ userId: 1 }),
  ]);
}

export async function createResetToken(db: Db, userId: string) {
  await ensureResetIndexes(db);
  // Any earlier request is void: asking twice must not leave two live links.
  await db.collection<ResetTokenDocument>("passwordResets").deleteMany({ userId });

  const token = randomBytes(32).toString("base64url");
  await db.collection<ResetTokenDocument>("passwordResets").insertOne({
    tokenHash: hashToken(token),
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60_000),
  });
  return token;
}

/** Resolves a token to its user, or null. Never says which check failed. */
export async function consumeResetToken(db: Db, token: string) {
  if (typeof token !== "string" || token.length < 20) return null;
  const record = await db
    .collection<ResetTokenDocument>("passwordResets")
    .findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() }, usedAt: { $exists: false } });
  if (!record) return null;

  // Constant-time compare, so a near-miss cannot be found by timing the lookup.
  const provided = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(record.tokenHash, "hex");
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) return null;

  const user = await db.collection<UserDocument>("users").findOne({ id: record.userId });
  if (!user) return null;
  return { user, tokenHash: record.tokenHash };
}

/** Marks the token spent. Called only once the new password is stored. */
export async function markResetTokenUsed(db: Db, tokenHash: string) {
  await db
    .collection<ResetTokenDocument>("passwordResets")
    .updateOne({ tokenHash }, { $set: { usedAt: new Date() } });
}
