/**
 * @vitest-environment jsdom
 */
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { expect } from "vitest";
import type { ExerciseParams } from "../../src/domain/exercise-params.js";
import type { PrescriptionType } from "../../src/domain/exercise-types.js";
import { TYPE_LABELS } from "../../src/ui/copy/my-defaults.js";
import {
  TypeDefaultEditor,
  type TypeDefaultEditorProps,
} from "../../src/ui/my-defaults/TypeDefaultEditor.js";
import {
  TYPE_DEFAULT_DOSE_ACCESSIBLE_NAMES,
  type TypeDefaultDoseAccessibleParamKey,
  typeDefaultEditorTypeTitleId,
} from "../../src/ui/my-defaults/type-default-editor-a11y.js";
import { TypeDefaultsFootnote } from "../../src/ui/my-defaults/TypeDefaultsFootnote.js";

export function resolveAriaLabelledByName(
  element: Element,
  root: Document = document,
): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .filter((id) => id.length > 0)
      .map((id) => root.getElementById(id)?.textContent?.trim() ?? "")
      .filter((part) => part.length > 0)
      .join(" ")
      .trim();
  }
  return element.getAttribute("aria-label")?.trim() ?? "";
}

type EditorProps = Omit<TypeDefaultEditorProps, "typeTitleId">;

export function renderTypeDefaultEditor(
  props: EditorProps,
  options?: RenderOptions,
): ReturnType<typeof render> {
  const typeTitleId = typeDefaultEditorTypeTitleId(props.type);
  const ui = (
    <>
      <h2 id={typeTitleId}>{TYPE_LABELS[props.type]}</h2>
      <TypeDefaultsFootnote />
      <TypeDefaultEditor {...props} typeTitleId={typeTitleId} />
    </>
  );
  return render(ui as ReactElement, options);
}

export const EDGE_CASE_OWN: Record<PrescriptionType, ExerciseParams> = {
  stretching: { hold_s: 45, per_day: 2, days_per_week: 4 },
  isometric: { reps: 12, hold_s: 45, sets: 1, days_per_week: 4 },
  concentric: {
    reps: 12,
    hold_s: 45,
    sets: 1,
    per_day: 2,
    ascent_s: 3,
    days_per_week: 4,
  },
  eccentric: { reps: 12, descent_s: 4, sets: 1, days_per_week: 4 },
};

/** Simulates the removed value-derived aria-label mutant from PR #35 review. */
export function valueDerivedAccessibleName(value: string): string {
  return value;
}

export { TYPE_DEFAULT_DOSE_ACCESSIBLE_NAMES };

export function doseParamKeyFromField(
  field: Element,
): TypeDefaultDoseAccessibleParamKey | null {
  const key = field.getAttribute("data-md-param");
  if (key !== null && key in TYPE_DEFAULT_DOSE_ACCESSIBLE_NAMES) {
    return key as TypeDefaultDoseAccessibleParamKey;
  }
  return null;
}

export function assertDoseFieldAccessibleName(
  field: Element,
  expected: string,
  root: Document = document,
): void {
  expect(resolveAriaLabelledByName(field, root)).toBe(expected);
}
