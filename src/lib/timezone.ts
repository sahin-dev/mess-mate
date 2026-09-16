/**
 * Wall-clock helpers for a named IANA timezone.
 *
 * A mess in Dhaka and a server in Frankfurt disagree about what "today" is for
 * nine hours a day, and a meal cutoff of 22:30 is meaningless unless it is
 * evaluated where the members actually live. Everything here works from
 * `Intl.DateTimeFormat`, so there is no timezone database to ship or update.
 */

export const DEFAULT_TIMEZONE = "Asia/Dhaka";

/** A short list for the picker; any other IANA name is still accepted. */
export const COMMON_TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Colombo",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value: unknown, fallback = DEFAULT_TIMEZONE) {
  return isValidTimezone(value) ? value : fallback;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** The wall-clock reading in `timeZone` at the given instant. */
export function zonedParts(timeZone: string, at: Date = new Date()): ZonedParts {
  const parts = partsFormatter(normalizeTimezone(timeZone)).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // "24" can appear at midnight in some environments; 24:00 is 00:00.
    hour: read("hour") % 24,
    minute: read("minute"),
  };
}

/** `YYYY-MM-DD` for the calendar day currently in progress in `timeZone`. */
export function todayInZone(timeZone: string, at: Date = new Date()) {
  const { year, month, day } = zonedParts(timeZone, at);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `YYYY-MM` for the settlement month currently in progress in `timeZone`. */
export function periodInZone(timeZone: string, at: Date = new Date()) {
  return todayInZone(timeZone, at).slice(0, 7);
}

/** Minutes past local midnight, so a cutoff can be compared without dates. */
export function minutesOfDayInZone(timeZone: string, at: Date = new Date()) {
  const { hour, minute } = zonedParts(timeZone, at);
  return hour * 60 + minute;
}

/** Parses `"22:30"` into minutes past midnight. Invalid input falls back. */
export function cutoffMinutes(cutoff: string, fallback = 22 * 60 + 30) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(cutoff);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Whether today's entry window has closed in the mess's own timezone.
 * A mess that allows entry at any time never closes.
 */
export function cutoffHasPassed(
  timeZone: string,
  cutoff: string,
  at: Date = new Date(),
) {
  return minutesOfDayInZone(timeZone, at) >= cutoffMinutes(cutoff);
}

/** e.g. "GMT+6" — shown next to the picker so the choice is verifiable. */
export function timezoneOffsetLabel(timeZone: string, at: Date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: normalizeTimezone(timeZone),
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** The current wall-clock time in the zone, e.g. "22:05". */
export function clockInZone(timeZone: string, at: Date = new Date()) {
  const { hour, minute } = zonedParts(timeZone, at);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** The viewer's own zone, used to point out a mismatch with the mess's. */
export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
