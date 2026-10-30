/** Share-link expiry uses America/Toronto (practitioner product default for this POC). */
export const SHARE_LINK_EXPIRY_TIME_ZONE = "America/Toronto";

const torontoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHARE_LINK_EXPIRY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function torontoDateOnlyFromInstant(instant: Date): string {
  return torontoDateFormatter.format(instant);
}

function parseDateOnlyParts(dateOnly: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly.trim());
  if (!match) {
    throw new Error("Invalid date-only format");
  }
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

/** Rejects impossible calendar dates such as 2026-02-30. */
export function assertTorontoDateOnlyRoundTrip(dateOnly: string): string {
  const trimmed = dateOnly.trim();
  parseDateOnlyParts(trimmed);
  const startMs = torontoStartOfDayUtcMs(trimmed);
  if (torontoDateOnlyFromInstant(new Date(startMs)) !== trimmed) {
    throw new Error("Invalid calendar date");
  }
  return trimmed;
}

export function torontoStartOfDayUtcMs(dateOnly: string): number {
  const { y, m, d } = parseDateOnlyParts(dateOnly);
  let low = Date.UTC(y, m - 1, d - 1, 0, 0, 0, 0);
  let high = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0);
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const label = torontoDateOnlyFromInstant(new Date(mid));
    if (label < dateOnly) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function torontoEndOfDayUtcIso(dateOnly: string): string {
  const start = assertTorontoDateOnlyRoundTrip(dateOnly);
  const nextDay = addTorontoCalendarDays(start, 1);
  const nextStartMs = torontoStartOfDayUtcMs(nextDay);
  return new Date(nextStartMs - 1).toISOString();
}

export function torontoTomorrowEarliestDateOnly(now: Date): string {
  const today = torontoDateOnlyFromInstant(now);
  return addTorontoCalendarDays(today, 1);
}

export function compareDateOnly(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Adds calendar days to a Toronto date-only string in O(1). */
export function addTorontoCalendarDays(dateOnly: string, days: number): string {
  const { y, m, d } = parseDateOnlyParts(assertTorontoDateOnlyRoundTrip(dateOnly));
  const rolled = new Date(Date.UTC(y, m - 1, d + days));
  const result = `${rolled.getUTCFullYear()}-${String(rolled.getUTCMonth() + 1).padStart(2, "0")}-${String(rolled.getUTCDate()).padStart(2, "0")}`;
  assertTorontoDateOnlyRoundTrip(result);
  return result;
}
