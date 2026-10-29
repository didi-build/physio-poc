/** Locked share-link expiry choices for publish overrides (DIDI-594). */

export const SHARE_LINK_EXPIRES_IN = {
  one_week: "1_week",
  thirty_days: "30_days",
  ninety_days: "90_days",
  one_year: "1_year",
  never: "never",
  custom_date: "custom_date",
} as const;

export type ShareLinkExpiresIn =
  (typeof SHARE_LINK_EXPIRES_IN)[keyof typeof SHARE_LINK_EXPIRES_IN];

export const SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM: readonly ShareLinkExpiresIn[] =
  Object.values(SHARE_LINK_EXPIRES_IN);
