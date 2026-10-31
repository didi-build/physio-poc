import type {
  SqlBatchStatement,
  SqlStoragePort,
} from "../../storage/ports/sql-storage.js";
import { SqlBatchGuardError } from "../../storage/errors/sql-batch-error.js";
import {
  ExerciseAliasesRepository,
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../../storage/repositories/exercise-data.js";
import {
  validateExerciseTitle,
  validateRequestedExerciseName,
} from "../../domain/exercise-free-text.js";
import { generateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import {
  ExerciseRequestsServiceError,
  isExerciseAliasUniqueConstraintError,
} from "./errors.js";

export type ExerciseDraftGeneratorResult = {
  exerciseId: string;
  versionId: string;
};

export type ExerciseDraftGenerator = (
  input: {
    sql: SqlStoragePort;
    requestId: string;
    requestedName: string;
    exerciseNote: string | null;
    requestedBy: string;
    now: string;
  },
  deps: {
    exercises: ExercisesRepository;
    versions: ExerciseVersionsRepository;
    requests: ExerciseRequestsRepository;
  },
) => Promise<ExerciseDraftGeneratorResult>;

/** Test and local stub: creates a stretch draft with the requested title. */
export const fakeExerciseDraftGenerator: ExerciseDraftGenerator = async (
  input,
  deps,
) => {
  const exerciseId = generateOpaqueEntityId();
  const versionId = generateOpaqueEntityId();
  const title = validateExerciseTitle(input.requestedName);

  await deps.exercises.insert({
    id: exerciseId,
    category: "stretch",
    created_by: input.requestedBy,
    created_at: input.now,
  });

  await deps.versions.insert({
    id: versionId,
    exerciseId,
    versionNumber: 1,
    status: "draft",
    approvedBy: null,
    approvedAt: null,
    title,
    description: "",
    createdAt: input.now,
  });

  await deps.requests.updateAfterDraftLink({
    id: input.requestId,
    status: "drafting",
    exerciseId,
    updatedAt: input.now,
  });

  return { exerciseId, versionId };
};

export async function appendMergeToDraftRequest(input: {
  sql: SqlStoragePort;
  targetRequestId: string;
  mergedName: string;
  mergedNote: string | null;
  now: string;
}): Promise<void> {
  const requests = new ExerciseRequestsRepository(input.sql);
  const aliases = new ExerciseAliasesRepository(input.sql);
  const row = await requests.findById(input.targetRequestId);
  if (!row || !row.exercise_id) {
    return;
  }

  const mergedParts: string[] = [];
  if (row.note) {
    mergedParts.push(row.note);
  }
  if (input.mergedNote) {
    mergedParts.push(input.mergedNote);
  }
  const mergedNote = mergedParts.length > 0 ? mergedParts.join("\n") : null;

  const aliasName = validateRequestedExerciseName(input.mergedName);
  const versions = new ExerciseVersionsRepository(input.sql);
  const draft = await versions.findDraftForExercise(row.exercise_id);
  const needsAliasInsert =
    draft !== null && draft.title.toLowerCase() !== aliasName.toLowerCase();

  if (needsAliasInsert && (await aliases.aliasExistsCaseInsensitive(aliasName))) {
    throw new ExerciseRequestsServiceError("Alias conflict", "alias_conflict");
  }

  const batchStatements: SqlBatchStatement[] = [];
  if (mergedNote !== null) {
    batchStatements.push(
      requests.buildUpdateNoteBatchStatement({
        id: input.targetRequestId,
        note: mergedNote,
        updatedAt: input.now,
      }),
    );
  }
  if (needsAliasInsert) {
    batchStatements.push(
      aliases.buildInsertBatchStatement({
        id: generateOpaqueEntityId(),
        exerciseId: row.exercise_id,
        alias: aliasName,
        createdAt: input.now,
      }),
    );
  }

  if (batchStatements.length === 0) {
    return;
  }

  try {
    await input.sql.batch(batchStatements);
  } catch (error) {
    if (error instanceof SqlBatchGuardError) {
      throw error;
    }
    if (isExerciseAliasUniqueConstraintError(error)) {
      throw new ExerciseRequestsServiceError("Alias conflict", "alias_conflict", {
        cause: error,
      });
    }
    throw error;
  }
}
