import { validateExerciseAlias } from "../../domain/exercise-free-text.js";
import type { ExerciseCategory } from "../../domain/exercise-types.js";
import { generateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import { SqlBatchGuardError } from "../../storage/errors/sql-batch-error.js";
import {
  BodyRegionsRepository,
  ExerciseAliasesRepository,
  ExerciseBodyRegionsRepository,
} from "../../storage/repositories/exercise-data.js";
import { DeepInfraExerciseDraftError } from "../../services/exercise-requests/deepinfra-exercise-draft-error.js";
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

function buildDraftDescription(payload: ExerciseDraftAiPayload): string {
  const defaultsLine = payload.default_sets_and_reps.trim();
  const body = payload.description.trim();
  if (body.length === 0) {
    return `Default sets and reps: ${defaultsLine}`;
  }
  return `Default sets and reps: ${defaultsLine}\n\n${body}`;
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
    let parsedPayload: ExerciseDraftAiPayload | null = null;
    let resolvedRegionIds: string[] | null = null;

    for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt += 1) {
      try {
        const completion = await client.complete(completionRequest);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(completion.contentJson);
        } catch {
          lastFailure = new DeepInfraExerciseDraftError(
            "deepinfra_exercise_draft_response_invalid",
          );
          continue;
        }
        const validated = parseAndValidateExerciseDraftAiPayload(parsedJson);
        if (!validated || !cueShapeValid(validated)) {
          lastFailure = new DeepInfraExerciseDraftError(
            "deepinfra_exercise_draft_response_invalid",
          );
          continue;
        }
        const regionIds = await resolveBodyRegionIds(input.sql, validated.body_regions);
        if (!regionIds) {
          lastFailure = new DeepInfraExerciseDraftError(
            "deepinfra_exercise_draft_response_invalid",
          );
          continue;
        }
        parsedPayload = validated;
        resolvedRegionIds = regionIds;
        break;
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

    if (!parsedPayload) {
      throw (
        lastFailure ??
        new DeepInfraExerciseDraftError("deepinfra_exercise_draft_response_invalid")
      );
    }

    const exerciseId = generateOpaqueEntityId();
    const versionId = generateOpaqueEntityId();
    const aliasesRepo = new ExerciseAliasesRepository(input.sql);
    const bodyRegionLinks = new ExerciseBodyRegionsRepository(input.sql);
    const category = parsedPayload.category as ExerciseCategory;

    const aliasStatements = [];
    const seenAliases = new Set<string>();
    for (const alias of parsedPayload.aliases) {
      const normalized = validateExerciseAlias(alias);
      const key = normalized.toLowerCase();
      if (seenAliases.has(key)) {
        continue;
      }
      seenAliases.add(key);
      aliasStatements.push(
        aliasesRepo.buildInsertBatchStatement({
          id: generateOpaqueEntityId(),
          exerciseId,
          alias: normalized,
          createdAt: input.now,
        }),
      );
    }

    const regionStatements = resolvedRegionIds!.map((regionId) =>
      bodyRegionLinks.buildLinkBatchStatement(exerciseId, regionId),
    );

    const batchStatements = [
      deps.requests.buildInsertBatchStatement({
        id: input.requestId,
        requestedName: input.requestedName,
        note: input.exerciseNote,
        requestedBy: input.requestedBy,
        status: "open",
        createdAt: input.now,
        updatedAt: input.now,
      }),
      deps.exercises.buildInsertBatchStatement({
        id: exerciseId,
        category,
        created_by: input.requestedBy,
        created_at: input.now,
      }),
      deps.versions.buildInsertAiDraftBatchStatement({
        id: versionId,
        exerciseId,
        title: parsedPayload.title,
        description: buildDraftDescription(parsedPayload),
        equipment: parsedPayload.equipment,
        startingPosition: parsedPayload.starting_position,
        steps: parsedPayload.steps,
        commonMistakes: parsedPayload.common_mistakes,
        regressions: parsedPayload.regressions,
        progressions: parsedPayload.progressions,
        precautions: parsedPayload.precautions,
        cueStretching: parsedPayload.cue_stretching,
        cueIsometric: parsedPayload.cue_isometric,
        cueConcentric: parsedPayload.cue_concentric,
        cueEccentric: parsedPayload.cue_eccentric,
        createdAt: input.now,
      }),
      ...aliasStatements,
      ...regionStatements,
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
      if (isExerciseAliasUniqueConstraintError(error)) {
        throw new ExerciseRequestsServiceError("Alias conflict", "alias_conflict", {
          cause: error,
        });
      }
      throw error;
    }

    return { exerciseId, versionId };
  };
}
