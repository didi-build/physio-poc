import type { PhysioServerConfig } from "../../http/config.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { RoutineConditionsRepository } from "../../storage/repositories/routines.js";
import { RoutineSimilarityReadRepository } from "../../storage/repositories/routine-similarity-read.js";
import { PractitionersRepository } from "../../storage/repositories/exercise-data.js";
import {
  requirePractitionerRecord,
  PractitionerNotFoundError,
} from "../practitioner-access.js";
import { scoreRoutineSimilarity } from "./routine-similarity-score.js";

export class RoutineSimilarityServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "practitioner_not_found"
      | "invalid_input"
      | "routine_not_found"
      | "draft_routine_not_found",
  ) {
    super(message);
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

function parseIdList(raw: unknown, field: string): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new RoutineSimilarityServiceError(
      `${field} must be an array`,
      "invalid_input",
    );
  }
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new RoutineSimilarityServiceError(
        `${field} must contain string ids`,
        "invalid_input",
      );
    }
    ids.push(validateOpaqueEntityId(item, field));
  }
  return ids;
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
    const practitionerId = validateOpaqueEntityId(
      input.practitionerId,
      "Practitioner id",
    );
    try {
      await requirePractitionerRecord(
        new PractitionersRepository(this.sql),
        practitionerId,
      );
    } catch (error) {
      if (error instanceof PractitionerNotFoundError) {
        throw new RoutineSimilarityServiceError(
          "Practitioner not found",
          "practitioner_not_found",
        );
      }
      throw error;
    }

    const similarity = this.config.routineSimilarity;
    if (similarity.aiSimilarityEnabled) {
      throw new RoutineSimilarityServiceError(
        "AI similarity is not implemented",
        "invalid_input",
      );
    }

    let draftExerciseIds = parseIdList(input.exerciseIds, "exercise_ids");
    let draftConditionIds = parseIdList(input.conditionIds, "condition_ids");
    let excludeRoutineId: string | undefined;

    if (input.excludeRoutineId !== undefined && input.excludeRoutineId !== null) {
      if (typeof input.excludeRoutineId !== "string") {
        throw new RoutineSimilarityServiceError(
          "exclude_routine_id must be a string",
          "invalid_input",
        );
      }
      excludeRoutineId = validateOpaqueEntityId(
        input.excludeRoutineId,
        "exclude_routine_id",
      );
    }

    if (input.draftRoutineId !== undefined && input.draftRoutineId !== null) {
      if (typeof input.draftRoutineId !== "string") {
        throw new RoutineSimilarityServiceError(
          "draft_routine_id must be a string",
          "invalid_input",
        );
      }
      const draftRoutineId = validateOpaqueEntityId(
        input.draftRoutineId,
        "draft_routine_id",
      );
      const loadedExerciseIds =
        await this.similarityRead.listExerciseIdsForVisibleRoutine(
          practitionerId,
          draftRoutineId,
        );
      if (loadedExerciseIds === null) {
        throw new RoutineSimilarityServiceError(
          "Draft routine not found",
          "draft_routine_not_found",
        );
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
