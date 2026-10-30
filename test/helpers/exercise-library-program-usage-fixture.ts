import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../../src/storage/repositories/programs.js";
import { TS } from "./exercise-sqlite-fixture.js";

export async function addProgramExerciseRow(
  storage: SqlStoragePort,
  input: {
    practitionerId: string;
    programId: string;
    rowId: string;
    exerciseId: string;
    versionId: string;
    position: number;
    title?: string;
  },
): Promise<void> {
  const programs = new ProgramsRepository(storage);
  const existing = await programs.findById(input.programId);
  if (!existing) {
    await programs.create({
      id: input.programId,
      createdBy: input.practitionerId,
      createdAt: TS,
    });
  }
  const rows = new ProgramRowsRepository(storage);
  await rows.replaceRow({
    id: input.rowId,
    programId: input.programId,
    position: input.position,
    exerciseId: input.exerciseId,
    exerciseVersionId: input.versionId,
    prescriptionType: "stretching",
    params: { hold_s: 30 },
    textSnapshot: { title: input.title ?? "Row" },
    draftUpdatedAt: TS,
  });
}
