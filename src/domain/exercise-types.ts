export const EXERCISE_CATEGORIES = ["stretch", "strengthening"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const PRESCRIPTION_TYPES = [
  "stretching",
  "isometric",
  "concentric",
  "eccentric",
] as const;
export type PrescriptionType = (typeof PRESCRIPTION_TYPES)[number];

export const VERSION_STATUSES = ["draft", "approved"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const REQUEST_STATUSES = ["open", "drafting", "approved", "withdrawn"] as const;
export type ExerciseRequestStatus = (typeof REQUEST_STATUSES)[number];

export const TYPE_DEFAULT_SCOPES = ["global", "practitioner"] as const;
export type TypeDefaultScope = (typeof TYPE_DEFAULT_SCOPES)[number];

export function prescriptionTypesForCategory(
  category: ExerciseCategory,
): readonly PrescriptionType[] {
  if (category === "stretch") {
    return ["stretching"];
  }
  return ["isometric", "concentric", "eccentric"];
}
