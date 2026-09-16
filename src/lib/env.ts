/**
 * Configuration is read lazily. Reading it at module scope would make
 * `next build` fail on a machine that has no database credentials, even though
 * nothing is queried during the build.
 */

export function mongoUri() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is not configured. Copy .env.example to .env and set it.");
  }
  return uri;
}

export function mongoDbName() {
  return process.env.MONGODB_DB?.trim() || "messmate";
}

export const isProduction = () => process.env.NODE_ENV === "production";

/**
 * The demo buttons sign a visitor straight in — including as a platform
 * administrator — so they stay off in production unless explicitly enabled.
 */
export function demoEnabled() {
  const flag = process.env.MESSMATE_ENABLE_DEMO?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return !isProduction();
}

/** Comma-separated extra origins allowed to POST, for example a preview domain. */
export function trustedOrigins() {
  return (process.env.MESSMATE_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
