import { todayInZone } from "@/lib/timezone";

/** A settlement period is one calendar month, identified as `YYYY-MM`. */
export type Period = string;

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && PERIOD_PATTERN.test(value);
}

export function currentPeriod(now = new Date()): Period {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function periodOf(isoDate: string): Period {
  return isoDate.slice(0, 7);
}

/** Shifts a period by a number of months. `shiftPeriod("2026-01", -1)` is `"2025-12"`. */
export function shiftPeriod(period: Period, months: number): Period {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: Period) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function periodShortLabel(period: Period) {
  const [year, month] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function daysInPeriod(period: Period) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Days left in the period, counting today, read in the mess's timezone.
 * Zero once the period is over.
 */
export function daysLeftInPeriod(period: Period, timeZone: string, now = new Date()) {
  const today = todayInZone(timeZone, now);
  if (period !== today.slice(0, 7)) return 0;
  return daysInPeriod(period) - Number(today.slice(8, 10)) + 1;
}

/**
 * The viewer's own calendar day. Anything that enforces a mess rule should use
 * `todayInZone` with the mess's timezone instead.
 */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
