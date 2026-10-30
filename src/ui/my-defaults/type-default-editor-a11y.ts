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

export function doseParamAriaLabelledBy(typeTitleId: string, key: ParamKey): string {
  const ids = [typeTitleId];
  if (key === "descent_s") {
    ids.push(TYPE_DEFAULT_FOOTNOTE_LABEL_IDS.down);
  }
  if (key === "rest_s") {
    ids.push(TYPE_DEFAULT_FOOTNOTE_LABEL_IDS.rest);
  }
  return ids.join(" ");
}
