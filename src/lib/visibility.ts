import type { ProfileVisibility, Visibility } from "@/lib/types";

/**
 * Who can see each piece of a profile.
 *
 * The default is "mess" for everything, which is exactly what the app did
 * before these settings existed — so an account that has never opened the
 * profile page keeps behaving the way its owner already expects.
 */
export const defaultVisibility: ProfileVisibility = {
  avatar: "mess",
  email: "mess",
  phone: "mess",
};

const LEVELS: Visibility[] = ["private", "mess", "public"];

const one = (value: unknown, fallback: Visibility): Visibility =>
  LEVELS.includes(value as Visibility) ? (value as Visibility) : fallback;

/** Fills in anything a stored profile predates or a request left out. */
export function mergeVisibility(stored: unknown): ProfileVisibility {
  const value = (stored ?? {}) as Partial<Record<keyof ProfileVisibility, unknown>>;
  return {
    avatar: one(value.avatar, defaultVisibility.avatar),
    email: one(value.email, defaultVisibility.email),
    phone: one(value.phone, defaultVisibility.phone),
  };
}

/**
 * Whether a viewer may see one field.
 *
 * `isSelf` always wins: you can always see your own details. `isManager` is an
 * exemption for the contact details only — a manager invited these people by
 * email and has to be able to reach them to run the house — and never applies
 * to the picture, where private means private.
 */
export function canSee(
  level: Visibility,
  viewer: { isSelf: boolean; inMess: boolean; isManager?: boolean },
) {
  if (viewer.isSelf) return true;
  if (level === "public") return true;
  if (level === "mess") return viewer.inMess;
  return Boolean(viewer.isManager);
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "Only me",
  mess: "People in my mess",
  public: "Anyone",
};
