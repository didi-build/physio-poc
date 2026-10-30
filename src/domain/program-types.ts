import type { PrescriptionType } from "./exercise-types.js";
import type { ExerciseParams } from "./exercise-params.js";

/** Resolved text copied onto a program row when added or updated. */
export type ProgramRowTextSnapshot = {
  title: string;
  description?: string;
  cue?: string;
  /** When set, library update prompts stay hidden until a newer approved version ships. */
  libraryUpdateDismissedVersionNumber?: number;
};

export type ProgramRowSnapshot = {
  position: number;
  exerciseId: string | null;
  exerciseVersionId: string | null;
  exerciseRequestId: string | null;
  prescriptionType: PrescriptionType;
  params: ExerciseParams;
  textSnapshot: ProgramRowTextSnapshot;
  note: string | null;
};

export type PublishedProgramSnapshot = {
  version: number;
  name: string;
  publishedAt: string;
  rows: ProgramRowSnapshot[];
};

export function parseProgramRowTextSnapshotJson(raw: string): ProgramRowTextSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("text_snapshot_json must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("text_snapshot_json must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.title !== "string" || record.title.trim().length === 0) {
    throw new Error("text_snapshot_json.title is required");
  }
  const snapshot: ProgramRowTextSnapshot = { title: record.title.trim() };
  if (typeof record.description === "string") {
    snapshot.description = record.description;
  }
  if (typeof record.cue === "string") {
    snapshot.cue = record.cue;
  }
  if (record.libraryUpdateDismissedVersionNumber !== undefined) {
    if (
      typeof record.libraryUpdateDismissedVersionNumber !== "number" ||
      !Number.isInteger(record.libraryUpdateDismissedVersionNumber) ||
      record.libraryUpdateDismissedVersionNumber < 1
    ) {
      throw new Error(
        "text_snapshot_json.libraryUpdateDismissedVersionNumber must be a positive integer",
      );
    }
    snapshot.libraryUpdateDismissedVersionNumber =
      record.libraryUpdateDismissedVersionNumber;
  }
  return snapshot;
}

export function parsePublishedProgramSnapshotJson(
  raw: string,
): PublishedProgramSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("published_snapshot_json must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("published_snapshot_json must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.version !== "number" || record.version < 1) {
    throw new Error("published_snapshot_json.version is required");
  }
  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    throw new Error("published_snapshot_json.name is required");
  }
  if (typeof record.publishedAt !== "string") {
    throw new Error("published_snapshot_json.publishedAt is required");
  }
  if (!Array.isArray(record.rows)) {
    throw new Error("published_snapshot_json.rows must be an array");
  }
  return {
    version: record.version,
    name: record.name,
    publishedAt: record.publishedAt,
    rows: record.rows as ProgramRowSnapshot[],
  };
}
