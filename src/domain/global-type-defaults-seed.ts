import type { PrescriptionType } from "./exercise-types.js";
import type { ExerciseParams } from "./exercise-params.js";

/**
 * Oct 23, 2026 CTO seed table (DIDI-594 data model comment).
 */
export const GLOBAL_TYPE_DEFAULTS_SEED: Record<PrescriptionType, ExerciseParams> = {
  stretching: {
    hold_s: 30,
    per_day: { min: 1, max: 3 },
    days_per_week: 7,
  },
  isometric: {
    reps: 1,
    sets: 3,
    hold_s: 10,
    days_per_week: 7,
  },
  concentric: {
    reps: 10,
    sets: 3,
    hold_s: 2,
    days_per_week: 3,
  },
  eccentric: {
    reps: 10,
    sets: 3,
    descent_s: 4,
    days_per_week: 3,
  },
};
