import type { PhysioServerConfig } from "../../http/config.js";
import {
  OpaqueEntityIdValidationError,
  validateOpaqueEntityId,
} from "../../domain/opaque-entity-id.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { RoutineConditionsRepository } from "../../storage/repositories/routines.js";
import { RoutineSimilarityReadRepository } from "../../storage/repositories/routine-similarity-read.js";
import { PractitionersRepository } from "../../storage/repositories/exercise-data.js";
import {
  requirePractitionerRecord,
  PractitionerNotFoundError,
} from "../practitioner-access.js";
import { ROUTINE_SIMILAR_MAX_INPUT_IDS } from "../../routine-similarity-config.js";
import { scoreRoutineSimilarity } from "./routine-similarity-score.js";

export type RoutineSimilarityErrorCode =
  | "practitioner_not_found"
  | "invalid_input"
  | "draft_routine_not_found"
  | "ai_similarity_not_implemented";

export class RoutineSimilarityServiceError extends Error {
  constructor(readonly code: RoutineSimilarityErrorCode) {
    super(code);
    this.name = "RoutineSimilarityServiceError";
  }
}

export type RoutineSimilarMatch = {
  routine_id: string;
  score: number;
  exercise_jaccard: number;
  condition_match: boolean;
  shared_exercise_ids: string[];
  shared_condition_ids: string[];
};

export type FindSimilarRoutinesResult = {
  threshold: number;
  condition_match_bonus: number;
  matches: RoutineSimilarMatch[];
};

function groupExerciseIdsByRoutine(
  rows: { routine_id: string; exercise_id: string }[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    let set = map.get(row.routine_id);
    if (!set) {
      set = new Set();
      map.set(row.routine_id, set);
    }
    set.add(row.exercise_id);
  }
  return map;
}

function assertValidOpaqueId(value: string, field: string): string {
  try {
    return validateOpaqueEntityId(value, field);
  } catch (error) {
    if (error instanceof OpaqueEntityIdValidationError) {
      throw new RoutineSimilarityServiceError("invalid_input");
    }
    throw error;
  }
}

function parseIdList(raw: unknown, field: string): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new RoutineSimilarityServiceError("invalid_input");
  }
  if (raw.length > ROUTINE_SIMILAR_MAX_INPUT_IDS) {
    throw new RoutineSimilarityServiceError("invalid_input");
  }
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new RoutineSimilarityServiceError("invalid_input");
    }
    ids.push(assertValidOpaqueId(item, field));
  }
  return ids;
}

function parseOptionalRoutineId(raw: unknown, field: string): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== "string") {
    throw new RoutineSimilarityServiceError("invalid_input");
  }
  return assertValidOpaqueId(raw, field);
}

export class RoutineSimilarityService {
  private readonly similarityRead: RoutineSimilarityReadRepository;
  private readonly routineConditions: RoutineConditionsRepository;

  constructor(
    private readonly sql: SqlStoragePort,
    private readonly config: PhysioServerConfig,
  ) {
    this.similarityRead = new RoutineSimilarityReadRepository(sql);
    this.routineConditions = new RoutineConditionsRepository(sql);
  }

  async findSimilar(input: {
    practitionerId: string;
    exerciseIds?: unknown;
    conditionIds?: unknown;
    excludeRoutineId?: unknown;
    draftRoutineId?: unknown;
  }): Promise<FindSimilarRoutinesResult> {
    let practitionerId: string;
    try {
      practitionerId = validateOpaqueEntityId(input.practitionerId, "Practitioner id");
    } catch (error) {
      if (error instanceof OpaqueEntityIdValidationError) {
        throw new RoutineSimilarityServiceError("invalid_input");
      }
      throw error;
    }
    try {
      await requirePractitionerRecord(
        new PractitionersRepository(this.sql),
        practitionerId,
      );
    } catch (error) {
      if (error instanceof PractitionerNotFoundError) {
        throw new RoutineSimilarityServiceError("practitioner_not_found");
      }
      throw error;
    }

    const similarity = this.config.routineSimilarity;
    if (similarity.aiSimilarityEnabled) {
      throw new RoutineSimilarityServiceError("ai_similarity_not_implemented");
    }

    let draftExerciseIds = parseIdList(input.exerciseIds, "exercise_ids");
    let draftConditionIds = parseIdList(input.conditionIds, "condition_ids");
    let excludeRoutineId = parseOptionalRoutineId(
      input.excludeRoutineId,
      "exclude_routine_id",
    );

    const draftRoutineId = parseOptionalRoutineId(
      input.draftRoutineId,
      "draft_routine_id",
    );
    if (draftRoutineId !== undefined) {
      const loadedExerciseIds =
        await this.similarityRead.listExerciseIdsForVisibleRoutine(
          practitionerId,
          draftRoutineId,
        );
      if (loadedExerciseIds === null) {
        throw new RoutineSimilarityServiceError("draft_routine_not_found");
      }
      excludeRoutineId = draftRoutineId;
      if (input.exerciseIds === undefined) {
        draftExerciseIds = loadedExerciseIds;
      }
      if (input.conditionIds === undefined) {
        draftConditionIds =
          await this.routineConditions.listConditionIdsForRoutine(draftRoutineId);
      }
    }

    const candidateRows = await this.similarityRead.listVisibleCandidateExerciseRows(
      practitionerId,
      excludeRoutineId,
    );
    const byRoutine = groupExerciseIdsByRoutine(candidateRows);
    const routineIds = [...byRoutine.keys()];
    const conditionMap =
      await this.similarityRead.listConditionIdsByRoutineIds(routineIds);

    const matches: RoutineSimilarMatch[] = [];
    for (const [routineId, exerciseSet] of byRoutine) {
      const scored = scoreRoutineSimilarity({
        draftExerciseIds,
        draftConditionIds,
        candidateExerciseIds: [...exerciseSet],
        candidateConditionIds: conditionMap.get(routineId) ?? [],
        conditionMatchBonus: similarity.conditionMatchBonus,
      });
      if (scored.score >= similarity.threshold) {
        matches.push({
          routine_id: routineId,
          ...scored,
        });
      }
    }

    matches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.routine_id.localeCompare(b.routine_id);
    });

    return {
      threshold: similarity.threshold,
      condition_match_bonus: similarity.conditionMatchBonus,
      matches: matches.slice(0, similarity.maxResults),
    };
  }
}
