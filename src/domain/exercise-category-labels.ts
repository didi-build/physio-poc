import type { ExerciseCategory } from "./exercise-types.js";

export type ExerciseCategoryLabel = "Stretching" | "Strengthening";

export function categoryToLabel(category: ExerciseCategory): ExerciseCategoryLabel {
  return category === "stretch" ? "Stretching" : "Strengthening";
}

export function labelToCategory(label: ExerciseCategoryLabel): ExerciseCategory {
  return label === "Stretching" ? "stretch" : "strengthening";
}

export function parseExerciseCategoryLabel(raw: string): ExerciseCategoryLabel | null {
  if (raw === "Stretching" || raw === "Strengthening") {
    return raw;
  }
  return null;
}
