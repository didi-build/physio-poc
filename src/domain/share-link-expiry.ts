import {
  SHARE_LINK_EXPIRES_IN,
  type ShareLinkExpiresIn,
} from "../mcp-connector/share-link-expiry.js";

export { SHARE_LINK_EXPIRES_IN, type ShareLinkExpiresIn };

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDateOnly(isoInstant: string): string {
  return isoInstant.slice(0, 10);
}

function parseDateOnly(value: string, fieldLabel: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ShareLinkExpiryValidationError(
      `${fieldLabel} must be an ISO date (YYYY-MM-DD)`,
    );
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ShareLinkExpiryValidationError(`${fieldLabel} is not a valid date`);
  }
  return parsed;
}

/** Any calendar date from tomorrow (UTC), no maximum. */
export function validateCustomLinkExpiryDate(
  dateOnly: string,
  now: Date = new Date(),
): string {
  const trimmed = dateOnly.trim();
  const target = parseDateOnly(trimmed, "Custom expiry date");
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  if (target.getTime() < tomorrow.getTime()) {
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
    parseDateOnly(dateOnly, "Custom expiry date");
    return `${dateOnly}T23:59:59.999Z`;
  }
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0,
  );
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
  const expiresMs = start + offsetDays * MS_PER_DAY;
  return new Date(expiresMs + MS_PER_DAY - 1).toISOString();
}

export function shareLinkExpiryDateOnlyFromInstant(isoInstant: string): string {
  return utcDateOnly(isoInstant);
}
