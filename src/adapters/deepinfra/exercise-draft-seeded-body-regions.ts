/**
 * Seeded body region labels (migrations/0001_exercise_data_model.sql lines 118-121).
 * Do not extend without product approval.
 */
export const SEEDED_BODY_REGION_LABELS = ["knee", "ankle", "hip"] as const;

export type SeededBodyRegionLabel = (typeof SEEDED_BODY_REGION_LABELS)[number];

export const SEEDED_BODY_REGION_IDS: Record<SeededBodyRegionLabel, string> = {
  knee: "br-knee",
  ankle: "br-ankle",
  hip: "br-hip",
};

export function isSeededBodyRegionLabel(value: string): value is SeededBodyRegionLabel {
  return (SEEDED_BODY_REGION_LABELS as readonly string[]).includes(value);
}
