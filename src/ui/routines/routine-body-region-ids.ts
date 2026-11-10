/** Maps routine filter pill labels to seeded `body_regions.id` values (v1 seed has knee, hip, ankle only). */

import { ROUTINE_BODY_REGION_PILLS } from "./routine-library-filters.js";

const LABEL_TO_ID: Record<string, string> = {
  knee: "br-knee",
  hip: "br-hip",
  ankle: "br-ankle",
};

const AUTHORING_PILLS = ROUTINE_BODY_REGION_PILLS.filter((pill) => pill.value !== null);

export function routineBodyRegionPillsForAuthoring(): {
  label: string;
  bodyRegionId: string | null;
}[] {
  return AUTHORING_PILLS.map((pill) => ({
    label: pill.label,
    bodyRegionId:
      pill.value === null ? null : (LABEL_TO_ID[pill.value.toLowerCase()] ?? null),
  }));
}

export function bodyRegionIdFromLabel(label: string): string | null {
  return LABEL_TO_ID[label.toLowerCase()] ?? null;
}

export const DEFAULT_ROUTINE_BODY_REGION_ID = "br-knee";
