import { validateFreeTextForPatientDetails } from "../mcp-connector/patient-detail-validator.js";
import {
  MAX_LENGTH_EXERCISE_ALIAS,
  MAX_LENGTH_EXERCISE_CHANGE_SUMMARY,
  MAX_LENGTH_EXERCISE_CUE,
  MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
  MAX_LENGTH_PROGRAM_TITLE,
  MAX_LENGTH_REQUESTED_EXERCISE_NAME,
  MAX_LENGTH_ROW_NOTES,
} from "../mcp-connector/text-limits.js";

export class FreeTextValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreeTextValidationError";
  }
}

function assertNoPatientDetails(text: string, fieldLabel: string): void {
  const result = validateFreeTextForPatientDetails(text);
  if (!result.ok) {
    throw new FreeTextValidationError(`${fieldLabel}: ${result.message}`);
  }
}

function assertMaxLength(text: string, max: number, fieldLabel: string): void {
  if (text.length > max) {
    throw new FreeTextValidationError(
      `${fieldLabel} must be at most ${String(max)} characters`,
    );
  }
}

/** Exercise version title and override title: trim, 1 to 80, no patient details. */
export function validateExerciseTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_LENGTH_PROGRAM_TITLE) {
    throw new FreeTextValidationError(
      `Title must be between 1 and ${String(MAX_LENGTH_PROGRAM_TITLE)} characters after trimming`,
    );
  }
  assertNoPatientDetails(trimmed, "Title");
  return trimmed;
}

export function validateExerciseTemplateText(text: string, fieldLabel: string): string {
  assertMaxLength(text, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT, fieldLabel);
  assertNoPatientDetails(text, fieldLabel);
  return text;
}

export function validateExerciseCue(cue: string, fieldLabel: string): string {
  const trimmed = cue.trim();
  if (trimmed.length < 1) {
    throw new FreeTextValidationError(`${fieldLabel} must not be empty or whitespace`);
  }
  assertMaxLength(trimmed, MAX_LENGTH_EXERCISE_CUE, fieldLabel);
  assertNoPatientDetails(trimmed, fieldLabel);
  return trimmed;
}

export function validateOptionalExerciseCue(
  cue: string | null | undefined,
  fieldLabel: string,
): string | null {
  if (cue === null || cue === undefined) {
    return null;
  }
  return validateExerciseCue(cue, fieldLabel);
}

export function validateExerciseAlias(alias: string): string {
  const trimmed = alias.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_LENGTH_EXERCISE_ALIAS) {
    throw new FreeTextValidationError(
      `Alias must be between 1 and ${String(MAX_LENGTH_EXERCISE_ALIAS)} characters after trimming`,
    );
  }
  assertNoPatientDetails(trimmed, "Alias");
  return trimmed;
}

export function validateChangeSummary(
  summary: string | null | undefined,
): string | null {
  if (summary === null || summary === undefined || summary === "") {
    return null;
  }
  assertMaxLength(summary, MAX_LENGTH_EXERCISE_CHANGE_SUMMARY, "Change summary");
  assertNoPatientDetails(summary, "Change summary");
  return summary;
}

export function validateRequestedExerciseName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_LENGTH_REQUESTED_EXERCISE_NAME) {
    throw new FreeTextValidationError(
      `Requested name must be between 1 and ${String(MAX_LENGTH_REQUESTED_EXERCISE_NAME)} characters after trimming`,
    );
  }
  assertNoPatientDetails(trimmed, "Requested name");
  return trimmed;
}

/** Program name: optional while drafting; required to publish. No patient details. */
export function validateProgramName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_LENGTH_PROGRAM_TITLE) {
    throw new FreeTextValidationError(
      `Program name must be between 1 and ${String(MAX_LENGTH_PROGRAM_TITLE)} characters after trimming`,
    );
  }
  assertNoPatientDetails(trimmed, "Program name");
  return trimmed;
}

export function validateOptionalProgramName(
  name: string | null | undefined,
): string | null {
  if (name === null || name === undefined || name.trim() === "") {
    return null;
  }
  return validateProgramName(name);
}

export function validateProgramRowNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined || note === "") {
    return null;
  }
  assertMaxLength(note, MAX_LENGTH_ROW_NOTES, "Row note");
  assertNoPatientDetails(note, "Row note");
  return note;
}

export function validateRequestNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined || note === "") {
    return null;
  }
  assertMaxLength(note, MAX_LENGTH_ROW_NOTES, "Note");
  assertNoPatientDetails(note, "Note");
  return note;
}

/** Routine name: optional while drafting; required to publish. No patient details. */
export function validateRoutineName(name: string): string {
  return validateProgramName(name);
}

export function validateOptionalRoutineName(
  name: string | null | undefined,
): string | null {
  return validateOptionalProgramName(name);
}

/** Who it is for: optional general audience line; must not hold patient details. */
export function validateRoutineWhoItsFor(
  text: string | null | undefined,
): string | null {
  if (text === null || text === undefined || text.trim() === "") {
    return null;
  }
  return validateExerciseTemplateText(text.trim(), "Who it is for");
}

/** Text override description (partial field edits allowed, but not empty whitespace). */
export function validateTextOverrideValue(key: string, value: string): string {
  if (key === "title") {
    return validateExerciseTitle(value);
  }
  if (key.startsWith("cue_")) {
    return validateExerciseCue(value, key);
  }
  if (key === "description") {
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      throw new FreeTextValidationError(
        "Description override must not be empty or whitespace",
      );
    }
    assertMaxLength(trimmed, MAX_LENGTH_EXERCISE_TEMPLATE_TEXT, "Description");
    assertNoPatientDetails(trimmed, "Description");
    return trimmed;
  }
  throw new FreeTextValidationError(`Unknown text override key: ${key}`);
}
