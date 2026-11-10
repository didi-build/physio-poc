import type { PublishedProgramSnapshot } from "../../domain/program-types.js";
import {
  PUBLISH_CHANGE_AFTER_SENDING,
  PUBLISH_CHANGE_REORDERED,
  PUBLISH_CHANGE_TITLE_CHANGED,
  publishChangeAddedExercise,
  publishChangeRemovedExercise,
} from "../../copy/program-publish-messages.js";
import type { ProgramBuilderRow, ProgramBuilderView } from "./types.js";

function rowSignature(row: {
  exercise_id: string | null;
  exercise_request_id: string | null;
  prescription_type: ProgramBuilderRow["prescription_type"];
  params: ProgramBuilderRow["params"];
  text_snapshot: { title: string };
  note: string | null;
}): string {
  return JSON.stringify({
    exercise_id: row.exercise_id,
    exercise_request_id: row.exercise_request_id,
    prescription_type: row.prescription_type,
    params: row.params,
    title: row.text_snapshot.title,
    note: row.note,
  });
}

export function computeProgramPublishChangeLines(input: {
  program: ProgramBuilderView;
  publishedSnapshot: PublishedProgramSnapshot | null;
}): string[] {
  const { program, publishedSnapshot } = input;
  if (!publishedSnapshot) {
    return [];
  }

  const lines: string[] = [];
  let contentChanged = false;

  const publishedName = publishedSnapshot.name.trim();
  const draftName = (program.name ?? "").trim();
  if (publishedName !== draftName) {
    lines.push(PUBLISH_CHANGE_TITLE_CHANGED);
  }

  const publishedRows = publishedSnapshot.rows;
  const draftRows = program.rows;

  const publishedByExercise = new Map<string, number>();
  publishedRows.forEach((row, index) => {
    const key = row.exerciseId ?? row.exerciseRequestId ?? `pos:${index}`;
    publishedByExercise.set(key, index);
  });
  const draftByExercise = new Map<string, number>();
  draftRows.forEach((row, index) => {
    const key = row.exercise_id ?? row.exercise_request_id ?? `pos:${row.position}`;
    draftByExercise.set(key, index);
  });

  for (const row of draftRows) {
    const key = row.exercise_id ?? row.exercise_request_id ?? `pos:${row.position}`;
    if (!publishedByExercise.has(key)) {
      lines.push(publishChangeAddedExercise(row.text_snapshot.title));
    }
  }

  for (const [index, row] of publishedRows.entries()) {
    const key = row.exerciseId ?? row.exerciseRequestId ?? `pos:${index}`;
    if (!draftByExercise.has(key)) {
      lines.push(publishChangeRemovedExercise(row.textSnapshot.title));
    }
  }

  for (const row of draftRows) {
    const key = row.exercise_id ?? row.exercise_request_id ?? `pos:${row.position}`;
    const publishedIndex = publishedByExercise.get(key);
    if (publishedIndex === undefined) {
      continue;
    }
    const published = publishedRows[publishedIndex];
    if (!published) {
      continue;
    }
    const draftSig = rowSignature(row);
    const publishedSig = rowSignature({
      exercise_id: published.exerciseId,
      exercise_request_id: published.exerciseRequestId,
      prescription_type: published.prescriptionType,
      params: published.params,
      text_snapshot: published.textSnapshot,
      note: published.note,
    });
    if (draftSig !== publishedSig) {
      contentChanged = true;
    }
  }

  const publishedOrder = publishedRows
    .map((row, index) => row.exerciseId ?? row.exerciseRequestId ?? `pos:${index}`)
    .filter((key) => draftByExercise.has(key));
  const draftOrder = draftRows.map(
    (row) => row.exercise_id ?? row.exercise_request_id ?? `pos:${row.position}`,
  );
  const sharedPublishedOrder = publishedOrder.filter((key) => draftByExercise.has(key));
  const sharedDraftOrder = draftOrder.filter((key) => publishedByExercise.has(key));
  if (
    sharedPublishedOrder.length > 0 &&
    sharedDraftOrder.length > 0 &&
    sharedPublishedOrder.join("|") !== sharedDraftOrder.join("|")
  ) {
    lines.push(PUBLISH_CHANGE_REORDERED);
  }

  if (contentChanged) {
    lines.push(PUBLISH_CHANGE_AFTER_SENDING);
  }

  return lines;
}

export function programHasPublishedSnapshot(
  status: ProgramBuilderView["auto_save_status"],
): boolean {
  return status.kind !== "not_published_yet";
}
