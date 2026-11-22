import type { PrescriptionType } from "./exercise-types.js";
import type { ExerciseParams } from "./exercise-params.js";
import type { ProgramRowTextSnapshot } from "./program-types.js";
import { parseExerciseParamsJson } from "./exercise-params.js";
import { PRESCRIPTION_TYPES } from "./exercise-types.js";

export type TypeMismatchUndoSnapshot = {
  exercise_request_id: string;
  prescription_type: PrescriptionType;
  params: ExerciseParams;
  note: string | null;
  text_snapshot: ProgramRowTextSnapshot;
};

const UNDO_KEY = "_typeMismatchUndo";

/** Undo data lives on the linked row until undo or the next row write; HTTP undo requires draft_updated_at. */

export function embedTypeMismatchUndoInTextSnapshotJson(
  publicSnapshot: ProgramRowTextSnapshot,
  undo: TypeMismatchUndoSnapshot,
): string {
  return JSON.stringify({
    ...publicSnapshot,
    [UNDO_KEY]: {
      exercise_request_id: undo.exercise_request_id,
      prescription_type: undo.prescription_type,
      params: undo.params,
      note: undo.note,
      text_snapshot: undo.text_snapshot,
    },
  });
}

export function readTypeMismatchUndoFromTextSnapshotJson(
  raw: string,
): TypeMismatchUndoSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const undo = record[UNDO_KEY];
  if (typeof undo !== "object" || undo === null) {
    return null;
  }
  const u = undo as Record<string, unknown>;
  if (typeof u.exercise_request_id !== "string") {
    return null;
  }
  if (
    typeof u.prescription_type !== "string" ||
    !(PRESCRIPTION_TYPES as readonly string[]).includes(u.prescription_type)
  ) {
    return null;
  }
  const prescriptionType = u.prescription_type as PrescriptionType;
  if (u.params !== undefined && typeof u.params !== "object") {
    return null;
  }
  const params =
    u.params === undefined ? {} : parseExerciseParamsJson(JSON.stringify(u.params));
  const text = u.text_snapshot;
  if (typeof text !== "object" || text === null) {
    return null;
  }
  const t = text as Record<string, unknown>;
  if (typeof t.title !== "string" || t.title.trim().length === 0) {
    return null;
  }
  const text_snapshot: ProgramRowTextSnapshot = { title: t.title.trim() };
  return {
    exercise_request_id: u.exercise_request_id,
    prescription_type: prescriptionType,
    params,
    note:
      u.note === null || u.note === undefined
        ? null
        : typeof u.note === "string"
          ? u.note
          : null,
    text_snapshot,
  };
}
