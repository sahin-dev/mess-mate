/**
 * The demo identities.
 *
 * The demo signs every visitor in as the same two shared accounts, so anything
 * that would change an account itself — its password, its address, its picture
 * — has to be refused there: one visitor doing it would lock out everyone who
 * came after, and the seeded data is only ever inserted, never repaired.
 *
 * Kept in its own module so both the seeder and the session layer can read it
 * without importing each other.
 */

export const DEMO_MESS_ID = "mess_demo_shapla";
export const DEMO_MANAGER_ID = "user_demo_manager";
export const DEMO_ADMIN_ID = "user_demo_admin";

export function isDemoUser(userId: string) {
  return userId === DEMO_MANAGER_ID || userId === DEMO_ADMIN_ID;
}
