const TAKA = "৳";

/** Absolute amount, no sign. Use `signedMoney` when the direction matters. */
export function formatMoney(value: number, options?: { decimals?: boolean }) {
  const rounded = options?.decimals ? Math.abs(value) : Math.round(Math.abs(value));
  return `${TAKA}${rounded.toLocaleString("en-US", {
    minimumFractionDigits: options?.decimals ? 2 : 0,
    maximumFractionDigits: options?.decimals ? 2 : 0,
  })}`;
}

/** Prefixes a true minus sign so a negative balance cannot be misread as positive. */
export function signedMoney(value: number, options?: { decimals?: boolean }) {
  if (Math.abs(value) < 0.5 && !options?.decimals) return formatMoney(0);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMoney(value, options)}`;
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    "en-GB",
    options ?? { day: "numeric", month: "short", year: "numeric" },
  ).format(date);
}

export function relativeTime(iso: string, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
  ];
  let value = seconds;
  for (const [unit, size] of units) {
    if (Math.abs(value) < size) return formatter.format(Math.round(value), unit);
    value /= size;
  }
  return formatter.format(Math.round(value), "year");
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Downloads rows as CSV. The byte-order mark makes Excel read it as UTF-8, so
 * the taka sign and member names survive the round trip.
 */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, and any page without clipboard permission, need the
    // hidden-textarea fallback.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    textarea.remove();
    return ok;
  }
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
