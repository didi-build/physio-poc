import type { ExerciseDetailsResult } from "../../services/exercise-library/types.js";
import {
  NO_EDITS_YET,
  PINNED_PREFIX,
  editsOnTopOfLibraryLine,
} from "../copy/exercise-library.js";

export function countMyCopyEdits(details: ExerciseDetailsResult): number {
  const textEdits = details.resolved_text.filter(
    (field) => field.resolved !== field.library_value,
  ).length;
  const paramEdits = Object.keys(details.param_overrides).length;
  return textEdits + paramEdits;
}

export function myCopyStatusLine(details: ExerciseDetailsResult): string {
  const pinned = details.favourite ? PINNED_PREFIX : "";
  const editCount = countMyCopyEdits(details);
  if (editCount === 0) {
    return `${pinned}${NO_EDITS_YET}`;
  }
  return `${pinned}${editsOnTopOfLibraryLine(editCount)}`;
}
