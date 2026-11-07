import type { ParamKey } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";

/** Stable id for the type title on each card (exercise type name, not copy). */
export function typeDefaultEditorTypeTitleId(type: PrescriptionType): string {
  return `md-type-title-${type}`;
}

/** Footnote word targets; spec.md Copy inventory line 207 (same text as TYPE_DEFAULTS_FOOTNOTE). */
export const TYPE_DEFAULT_FOOTNOTE_LABEL_IDS = {
  up: "md-footnote-label-up",
  down: "md-footnote-label-down",
  rest: "md-footnote-label-rest",
} as const;

/** design/app/settings-link-expiry/spec.md, Dose field labels: accessible names (no values). */
export const TYPE_DEFAULT_DOSE_ACCESSIBLE_NAMES = {
  reps: "Reps",
  hold_s: "Hold in seconds",
  sets: "Sets",
  per_day: "Times per day",
  days_per_week: "Days per week",
} as const satisfies Partial<Record<ParamKey, string>>;

export type TypeDefaultDoseAccessibleParamKey =
  keyof typeof TYPE_DEFAULT_DOSE_ACCESSIBLE_NAMES;

export const TYPE_DEFAULT_DOSE_ACCESSIBLE_LABEL_IDS: Record<
  TypeDefaultDoseAccessibleParamKey,
  string
> = {
  reps: "md-dose-a11y-reps",
  hold_s: "md-dose-a11y-hold-s",
  sets: "md-dose-a11y-sets",
  per_day: "md-dose-a11y-per-day",
  days_per_week: "md-dose-a11y-days-per-week",
};

function isTypeDefaultDoseAccessibleParam(
  key: ParamKey,
): key is TypeDefaultDoseAccessibleParamKey {
  return key in TYPE_DEFAULT_DOSE_ACCESSIBLE_NAMES;
}

export function doseParamAriaLabelledBy(typeTitleId: string, key: ParamKey): string {
  if (isTypeDefaultDoseAccessibleParam(key)) {
    return TYPE_DEFAULT_DOSE_ACCESSIBLE_LABEL_IDS[key];
  }
  const ids = [typeTitleId];
  if (key === "descent_s") {
    ids.push(TYPE_DEFAULT_FOOTNOTE_LABEL_IDS.down);
  }
  if (key === "rest_s") {
    ids.push(TYPE_DEFAULT_FOOTNOTE_LABEL_IDS.rest);
  }
  return ids.join(" ");
}
