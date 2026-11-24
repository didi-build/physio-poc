import type {
  SqlBatchStatement,
  SqlStoragePort,
} from "../../storage/ports/sql-storage.js";
import { SqlBatchGuardError } from "../../storage/errors/sql-batch-error.js";
import {
  ExerciseAliasesRepository,
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
} from "../../storage/repositories/exercise-data.js";
import {
  FreeTextValidationError,
  validateExerciseTitle,
  validateRequestNote,
  validateRequestedExerciseName,
} from "../../domain/exercise-free-text.js";
import { generateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import { DeepInfraExerciseDraftError } from "./deepinfra-exercise-draft-error.js";
import {
  ExerciseRequestsServiceError,
  isExerciseAliasUniqueConstraintError,
} from "./errors.js";
import type { ExerciseDraftGenerator } from "./exercise-draft-generator-types.js";

export type {
  ExerciseDraftGenerator,
  ExerciseDraftGeneratorResult,
  ExerciseDraftGeneratorInput,
  ExerciseDraftGeneratorDeps,
} from "./exercise-draft-generator-types.js";

export type FakeExerciseDraftGeneratorOptions = {
  failText?: boolean;
};

export function createFakeExerciseDraftGenerator(
  options: FakeExerciseDraftGeneratorOptions = {},
): ExerciseDraftGenerator {
  return async (input, deps) => {
    if (options.failText) {
      throw new DeepInfraExerciseDraftError("deepinfra_exercise_draft_request_failed");
    }
    return fakeExerciseDraftGenerator(input, deps);
  };
}

export type DelayedFakeExerciseDraftGeneratorOptions =
  FakeExerciseDraftGeneratorOptions & {
    delayMs?: number;
  };

/** Wraps the fake generator with an awaitable delay for concurrent generate tests. */
export function createDelayedFakeExerciseDraftGenerator(
  options: DelayedFakeExerciseDraftGeneratorOptions = {},
): ExerciseDraftGenerator {
  const inner = createFakeExerciseDraftGenerator(options);
  const delayMs = options.delayMs ?? 200;
  return async (input, deps) => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
    return inner(input, deps);
  };
}

/** Test and local stub: creates a stretch draft with the requested title. */
const FAKE_DRAFT_REGEN_SENTINEL = "Regenerated draft text";

export const fakeExerciseDraftGenerator: ExerciseDraftGenerator = async (
  input,
  deps,
) => {
  if (input.existingExerciseId && input.existingVersionId) {
    const noteSuffix =
      input.regenerationNote && input.regenerationNote.trim().length > 0
        ? ` ${input.regenerationNote.trim()}`
        : "";
    await deps.versions.updateDraftFields(input.existingVersionId, {
      description: `${FAKE_DRAFT_REGEN_SENTINEL}.${noteSuffix}`.trim(),
      steps: "1. Perform the movement with control.",
      equipment: "None",
      startingPosition: "Start in a comfortable position.",
      endingPosition: "Finish with heel near the buttock.",
    });
    return {
      exerciseId: input.existingExerciseId,
      versionId: input.existingVersionId,
    };
  }

  const existing = await deps.requests.findById(input.requestId);
  if (!existing) {
    await input.sql.batch([
      deps.requests.buildInsertBatchStatement({
        id: input.requestId,
        requestedName: input.requestedName,
        note: input.exerciseNote,
        requestedBy: input.requestedBy,
        status: "drafting",
        createdAt: input.now,
        updatedAt: input.now,
      }),
    ]);
  }
  const exerciseId = generateOpaqueEntityId();
  const versionId = generateOpaqueEntityId();
  const title = validateExerciseTitle(input.requestedName);

  const batchStatements: SqlBatchStatement[] = [
    deps.exercises.buildInsertBatchStatement({
      id: exerciseId,
      category: "stretch",
      created_by: input.requestedBy,
      created_at: input.now,
    }),
    deps.versions.buildInsertMinimalDraftBatchStatement({
      id: versionId,
      exerciseId,
      title,
      createdAt: input.now,
    }),
    deps.requests.buildUpdateAfterDraftLinkBatchStatement({
      id: input.requestId,
      status: "drafting",
      exerciseId,
      updatedAt: input.now,
    }),
  ];

  try {
    await input.sql.batch(batchStatements);
  } catch (error) {
    if (error instanceof SqlBatchGuardError) {
      throw new ExerciseRequestsServiceError("Submit failed", "submit_failed", {
        cause: error,
      });
    }
    throw error;
  }

  return { exerciseId, versionId };
};

function mapMergedNoteValidationError(err: unknown): never {
  if (err instanceof FreeTextValidationError) {
    throw new ExerciseRequestsServiceError(err.message, "invalid_input");
  }
  throw err;
}

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
  let mergedNote = mergedParts.length > 0 ? mergedParts.join("\n") : null;
  if (mergedNote !== null) {
    try {
      mergedNote = validateRequestNote(mergedNote);
    } catch (err) {
      mapMergedNoteValidationError(err);
    }
  }

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
    if (error instanceof FreeTextValidationError) {
      mapMergedNoteValidationError(error);
    }
    throw error;
  }
}
