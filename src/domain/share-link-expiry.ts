import {
  SHARE_LINK_EXPIRES_IN,
  type ShareLinkExpiresIn,
} from "../mcp-connector/share-link-expiry.js";
import {
  addTorontoCalendarDays,
  assertTorontoDateOnlyRoundTrip,
  compareDateOnly,
  torontoDateOnlyFromInstant,
  torontoEndOfDayUtcIso,
  torontoStartOfDayUtcMs,
  torontoTomorrowEarliestDateOnly,
} from "./toronto-calendar.js";

export { SHARE_LINK_EXPIRES_IN, type ShareLinkExpiresIn };

/** Fallback when the seeded global row is missing (matches migration seed). */
export const GLOBAL_SHARE_LINK_DEFAULT_EXPIRES_IN = SHARE_LINK_EXPIRES_IN.one_year;

export class ShareLinkExpiryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareLinkExpiryValidationError";
  }
}

export type ShareLinkExpiryChoice = {
  expiresIn: ShareLinkExpiresIn;
  customExpiresOn?: string | null;
};

/** Any calendar date from tomorrow in America/Toronto, no maximum. */
export function validateCustomLinkExpiryDate(
  dateOnly: string,
  now: Date = new Date(),
): string {
  let trimmed: string;
  try {
    trimmed = assertTorontoDateOnlyRoundTrip(dateOnly.trim());
  } catch {
    throw new ShareLinkExpiryValidationError("Invalid calendar date");
  }
  const earliest = torontoTomorrowEarliestDateOnly(now);
  if (compareDateOnly(trimmed, earliest) < 0) {
    throw new ShareLinkExpiryValidationError(
      "Custom expiry date must be any date from tomorrow",
    );
  }
  return trimmed;
}

export function validateShareLinkExpiryChoice(
  choice: ShareLinkExpiryChoice,
  now: Date = new Date(),
): ShareLinkExpiryChoice {
  if (choice.expiresIn === SHARE_LINK_EXPIRES_IN.custom_date) {
    const customExpiresOn = validateCustomLinkExpiryDate(
      choice.customExpiresOn ?? "",
      now,
    );
    return { expiresIn: choice.expiresIn, customExpiresOn };
  }
  if (choice.customExpiresOn) {
    throw new ShareLinkExpiryValidationError(
      "custom_expires_on is only allowed when expires_in is custom_date",
    );
  }
  return { expiresIn: choice.expiresIn, customExpiresOn: null };
}

export function resolveShareLinkExpiresAt(
  choice: ShareLinkExpiryChoice,
  now: Date = new Date(),
): string | null {
  const validated = validateShareLinkExpiryChoice(choice, now);
  if (validated.expiresIn === SHARE_LINK_EXPIRES_IN.never) {
    return null;
  }
  if (validated.expiresIn === SHARE_LINK_EXPIRES_IN.custom_date) {
    const dateOnly = validated.customExpiresOn ?? "";
    assertTorontoDateOnlyRoundTrip(dateOnly);
    return torontoEndOfDayUtcIso(dateOnly);
  }
  const todayToronto = torontoDateOnlyFromInstant(now);
  const dayOffsets: Record<
    Exclude<ShareLinkExpiresIn, "never" | "custom_date">,
    number
  > = {
    [SHARE_LINK_EXPIRES_IN.one_week]: 7,
    [SHARE_LINK_EXPIRES_IN.thirty_days]: 30,
    [SHARE_LINK_EXPIRES_IN.ninety_days]: 90,
    [SHARE_LINK_EXPIRES_IN.one_year]: 365,
  };
  const offsetDays = dayOffsets[validated.expiresIn];
  const expiryDateOnly = addTorontoCalendarDays(todayToronto, offsetDays);
  return torontoEndOfDayUtcIso(expiryDateOnly);
}

export function shareLinkExpiryDateOnlyFromInstant(isoInstant: string): string {
  return torontoDateOnlyFromInstant(new Date(isoInstant));
}

/** Exact one-year expiry instant for tests (Toronto calendar, 365 days). */
export function resolveOneYearExpiresAt(now: Date): string {
  return resolveShareLinkExpiresAt(
    { expiresIn: SHARE_LINK_EXPIRES_IN.one_year },
    now,
  ) as string;
}

export function torontoTodayStartUtcMs(now: Date): number {
  return torontoStartOfDayUtcMs(torontoDateOnlyFromInstant(now));
}
