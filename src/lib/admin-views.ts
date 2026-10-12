/** Sections of the admin console. Shared by the server page and the client. */
export const ADMIN_VIEWS = [
  "overview",
  "users",
  "messes",
  "listings",
  "announcements",
  "activity",
  "audit",
  "health",
] as const;

export type AdminView = (typeof ADMIN_VIEWS)[number];

export function isAdminView(value: unknown): value is AdminView {
  return typeof value === "string" && (ADMIN_VIEWS as readonly string[]).includes(value);
}
