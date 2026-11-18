import {
  FreeTextValidationError,
  validateExerciseAlias,
} from "../../domain/exercise-free-text.js";
import type { ExerciseCategory } from "../../domain/exercise-types.js";
import { generateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import { SqlBatchGuardError } from "../../storage/errors/sql-batch-error.js";
import type { SqlBatchStatement } from "../../storage/ports/sql-storage.js";
import {
  BodyRegionsRepository,
  ExerciseAliasesRepository,
  ExerciseBodyRegionsRepository,
} from "../../storage/repositories/exercise-data.js";
import { DeepInfraExerciseDraftError } from "../../services/exercise-requests/deepinfra-exercise-draft-error.js";
import { deepInfraExerciseDraftError } from "./deepinfra-draft-error-factory.js";
import {
  ExerciseRequestsServiceError,
  isExerciseAliasUniqueConstraintError,
} from "../../services/exercise-requests/errors.js";
import type {
  ExerciseDraftGenerator,
  ExerciseDraftGeneratorInput,
} from "../../services/exercise-requests/exercise-draft-generator-types.js";
import {
  openAiJsonSchemaResponseFormat,
  parseAndValidateExerciseDraftAiPayload,
  type ExerciseDraftAiPayload,
} from "./exercise-draft-ai-schema.js";
import { EXERCISE_DRAFT_SYSTEM_PROMPT } from "./exercise-draft-system-prompt.js";
import {
  DeepInfraChatCompletionClient,
  isNonRetryableDeepInfraHttpStatus,
  type DeepInfraChatCompletionRequest,
} from "./deepinfra-chat-completion-client.js";
import { resolveDeepInfraExerciseDraftModelId } from "./exercise-draft-ai-config.js";

export type DeepInfraExerciseDraftGeneratorConfig = {
  apiKey: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  responseMaxBytes?: number;
};

const MAX_AI_ATTEMPTS = 2;

function buildUserPrompt(input: ExerciseDraftGeneratorInput): string {
  const lines = [`Exercise name: ${input.requestedName}`];
  lines.push(
    input.exerciseNote && input.exerciseNote.trim().length > 0
      ? `Note: ${input.exerciseNote.trim()}`
      : "Note: None",
  );
  if (input.regenerationNote && input.regenerationNote.trim().length > 0) {
    lines.push(`Regenerate note: ${input.regenerationNote.trim()}`);
  }
  return lines.join("\n");
}

function cueShapeValid(payload: ExerciseDraftAiPayload): boolean {
  if (payload.category === "stretch") {
    return (
      typeof payload.cue_stretching === "string" &&
      payload.cue_stretching.trim().length > 0 &&
      payload.cue_isometric === null &&
      payload.cue_concentric === null &&
      payload.cue_eccentric === null
    );
  }
  return (
    payload.cue_stretching === null &&
    typeof payload.cue_isometric === "string" &&
    payload.cue_isometric.trim().length > 0 &&
    typeof payload.cue_concentric === "string" &&
    payload.cue_concentric.trim().length > 0 &&
    typeof payload.cue_eccentric === "string" &&
    payload.cue_eccentric.trim().length > 0
  );
}

async function resolveBodyRegionIds(
  sql: ExerciseDraftGeneratorInput["sql"],
  labels: string[],
): Promise<string[] | null> {
  const regions = new BodyRegionsRepository(sql);
  const all = await regions.listAll();
  const ids: string[] = [];
  for (const label of labels) {
    const normalized = label.trim().toLowerCase();
    const match = all.find((row) => row.label.toLowerCase() === normalized);
    if (!match) {
      return null;
    }
    if (!ids.includes(match.id)) {
      ids.push(match.id);
    }
  }
  return ids.length > 0 ? ids : null;
}

function draftDescription(payload: ExerciseDraftAiPayload): string {
  return payload.description.trim();
}

type GeneratorDeps = Parameters<ExerciseDraftGenerator>[1];

type PreparedDraftBatch = {
  exerciseId: string;
  versionId: string;
  statements: SqlBatchStatement[];
};

async function buildPersistBatchStatements(input: {
  payload: ExerciseDraftAiPayload;
  regionIds: string[];
  generatorInput: ExerciseDraftGeneratorInput;
  deps: GeneratorDeps;
}): Promise<PreparedDraftBatch> {
  const { payload, regionIds, generatorInput: genIn, deps } = input;
  const exerciseId = generateOpaqueEntityId();
  const versionId = generateOpaqueEntityId();
  const category = payload.category as ExerciseCategory;
  const aliasesRepo = new ExerciseAliasesRepository(genIn.sql);
  const bodyRegionLinks = new ExerciseBodyRegionsRepository(genIn.sql);

  const aliasStatements = [];
  const seenAliases = new Set<string>();
  for (const alias of payload.aliases) {
    const normalized = validateExerciseAlias(alias);
    const key = normalized.toLowerCase();
    if (seenAliases.has(key)) {
      continue;
    }
    seenAliases.add(key);
    if (await aliasesRepo.aliasExistsCaseInsensitive(normalized)) {
      throw deepInfraExerciseDraftError("deepinfra_exercise_draft_response_invalid");
    }
    aliasStatements.push(
      aliasesRepo.buildInsertBatchStatement({
        id: generateOpaqueEntityId(),
        exerciseId,
        alias: normalized,
        createdAt: genIn.now,
      }),
    );
  }

  const regionStatements = regionIds.map((regionId) =>
    bodyRegionLinks.buildLinkBatchStatement(exerciseId, regionId),
  );

  try {
    return {
      exerciseId,
      versionId,
      statements: [
        deps.requests.buildInsertBatchStatement({
          id: genIn.requestId,
          requestedName: genIn.requestedName,
          note: genIn.exerciseNote,
          requestedBy: genIn.requestedBy,
          status: "open",
          createdAt: genIn.now,
          updatedAt: genIn.now,
        }),
        deps.exercises.buildInsertBatchStatement({
          id: exerciseId,
          category,
          created_by: genIn.requestedBy,
          created_at: genIn.now,
        }),
        deps.versions.buildInsertAiDraftBatchStatement({
          id: versionId,
          exerciseId,
          title: payload.title,
          description: draftDescription(payload),
          equipment: payload.equipment,
          startingPosition: payload.starting_position,
          steps: payload.steps,
          commonMistakes: payload.common_mistakes,
          regressions: payload.regressions,
          progressions: payload.progressions,
          precautions: payload.precautions,
          cueStretching: payload.cue_stretching,
          cueIsometric: payload.cue_isometric,
          cueConcentric: payload.cue_concentric,
          cueEccentric: payload.cue_eccentric,
          createdAt: genIn.now,
        }),
        ...aliasStatements,
        ...regionStatements,
        deps.requests.buildUpdateAfterDraftLinkBatchStatement({
          id: genIn.requestId,
          status: "drafting",
          exerciseId,
          updatedAt: genIn.now,
        }),
      ],
    };
  } catch (error) {
    if (error instanceof FreeTextValidationError) {
      throw deepInfraExerciseDraftError("deepinfra_exercise_draft_response_invalid");
    }
    throw error;
  }
}

export function createDeepInfraExerciseDraftGenerator(
  config: DeepInfraExerciseDraftGeneratorConfig,
): ExerciseDraftGenerator {
  const modelId = resolveDeepInfraExerciseDraftModelId(config.modelId);
  const client = new DeepInfraChatCompletionClient({
    apiKey: config.apiKey,
    fetchImpl: config.fetchImpl,
    timeoutMs: config.timeoutMs,
    responseMaxBytes: config.responseMaxBytes,
  });

  return async (input, deps) => {
    const completionRequest: DeepInfraChatCompletionRequest = {
      model: modelId,
      messages: [
        { role: "system", content: EXERCISE_DRAFT_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
      response_format: openAiJsonSchemaResponseFormat(),
    };

    let lastFailure: DeepInfraExerciseDraftError | null = null;

    for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt += 1) {
      try {
        const completion = await client.complete(completionRequest);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(completion.contentJson);
        } catch {
          lastFailure = deepInfraExerciseDraftError(
            "deepinfra_exercise_draft_response_invalid",
          );
          continue;
        }
        const validated = parseAndValidateExerciseDraftAiPayload(parsedJson);
        if (!validated || !cueShapeValid(validated)) {
          lastFailure = deepInfraExerciseDraftError(
            "deepinfra_exercise_draft_response_invalid",
          );
          continue;
        }
        const regionIds = await resolveBodyRegionIds(input.sql, validated.body_regions);
        if (!regionIds) {
          lastFailure = deepInfraExerciseDraftError(
            "deepinfra_exercise_draft_response_invalid",
          );
          continue;
        }
        let prepared: Awaited<ReturnType<typeof buildPersistBatchStatements>>;
        try {
          prepared = await buildPersistBatchStatements({
            payload: validated,
            regionIds,
            generatorInput: input,
            deps,
          });
        } catch (error) {
          if (error instanceof DeepInfraExerciseDraftError) {
            if (error.code === "deepinfra_exercise_draft_response_invalid") {
              lastFailure = error;
              continue;
            }
            throw error;
          }
          throw error;
        }

        try {
          await input.sql.batch(prepared.statements);
        } catch (error) {
          if (error instanceof SqlBatchGuardError) {
            throw new ExerciseRequestsServiceError("Submit failed", "submit_failed", {
              cause: error,
            });
          }
          if (isExerciseAliasUniqueConstraintError(error)) {
            lastFailure = deepInfraExerciseDraftError(
              "deepinfra_exercise_draft_response_invalid",
            );
            continue;
          }
          throw error;
        }

        return { exerciseId: prepared.exerciseId, versionId: prepared.versionId };
      } catch (error) {
        if (error instanceof DeepInfraExerciseDraftError) {
          lastFailure = error;
          if (
            error.code === "deepinfra_exercise_draft_request_failed" &&
            error.httpStatus !== undefined &&
            isNonRetryableDeepInfraHttpStatus(error.httpStatus)
          ) {
            throw error;
          }
          continue;
        }
        throw error;
      }
    }

    throw (
      lastFailure ??
      deepInfraExerciseDraftError("deepinfra_exercise_draft_response_invalid")
    );
  };
}
