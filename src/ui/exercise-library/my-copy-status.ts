import type { ExerciseDetailsResult } from "../../services/exercise-library/types.js";
import {
  NO_EDITS_YET,
  PINNED_PREFIX,
  editsOnTopOfLibraryLine,
} from "../copy/exercise-library.js";

export function countMyCopyEdits(
  resolvedText: ExerciseDetailsResult["resolved_text"],
): number {
  return resolvedText.filter((field) => field.resolved !== field.library_value).length;
}

export function myCopyStatusLine(details: ExerciseDetailsResult): string {
  const pinned = details.favourite ? PINNED_PREFIX : "";
  const editCount = countMyCopyEdits(details.resolved_text);
  if (editCount === 0) {
    return `${pinned}${NO_EDITS_YET}`;
  }
  return `${pinned}${editsOnTopOfLibraryLine(editCount)}`;
}
