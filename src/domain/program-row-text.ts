import {
  validateExerciseTemplateText,
  validateExerciseTitle,
  validateOptionalExerciseCue,
} from "./exercise-free-text.js";
import type { ProgramRowTextSnapshot } from "./program-types.js";

export function validateProgramRowTextSnapshot(
  snapshot: ProgramRowTextSnapshot,
): ProgramRowTextSnapshot {
  const title = validateExerciseTitle(snapshot.title);
  const result: ProgramRowTextSnapshot = { title };
  if (snapshot.description !== undefined && snapshot.description !== "") {
    result.description = validateExerciseTemplateText(
      snapshot.description,
      "Description",
    );
  }
  const cue = validateOptionalExerciseCue(snapshot.cue, "Cue");
  if (cue !== null) {
    result.cue = cue;
  }
  return result;
}
