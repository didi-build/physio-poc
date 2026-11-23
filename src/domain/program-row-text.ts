import {
  validateExerciseTitle,
  validateOptionalExerciseCue,
  validateOptionalTrimmedExerciseTemplateText,
} from "./exercise-free-text.js";
import type { ProgramRowTextSnapshot } from "./program-types.js";

export function validateProgramRowTextSnapshot(
  snapshot: ProgramRowTextSnapshot,
): ProgramRowTextSnapshot {
  const title = validateExerciseTitle(snapshot.title);
  const result: ProgramRowTextSnapshot = { title };
  if (snapshot.description !== undefined) {
    result.description = validateOptionalTrimmedExerciseTemplateText(
      snapshot.description,
      "Description",
    );
  }
  if (snapshot.starting_position !== undefined) {
    result.starting_position = validateOptionalTrimmedExerciseTemplateText(
      snapshot.starting_position,
      "Starting position",
    );
  }
  if (snapshot.ending_position !== undefined) {
    result.ending_position = validateOptionalTrimmedExerciseTemplateText(
      snapshot.ending_position,
      "Ending position",
    );
  }
  const cue = validateOptionalExerciseCue(snapshot.cue, "Cue");
  if (cue !== null) {
    result.cue = cue;
  }
  if (snapshot.libraryUpdateDismissedVersionNumber !== undefined) {
    if (
      !Number.isInteger(snapshot.libraryUpdateDismissedVersionNumber) ||
      snapshot.libraryUpdateDismissedVersionNumber < 1
    ) {
      throw new Error("libraryUpdateDismissedVersionNumber must be a positive integer");
    }
    result.libraryUpdateDismissedVersionNumber =
      snapshot.libraryUpdateDismissedVersionNumber;
  }
  return result;
}
