import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../../storage/repositories/exercise-data.js";

export type ExerciseDraftGeneratorResult = {
  exerciseId: string;
  versionId: string;
};

export type ExerciseDraftGeneratorInput = {
  sql: SqlStoragePort;
  requestId: string;
  requestedName: string;
  exerciseNote: string | null;
  /** Optional note for regeneration (review UI orchestration is out of scope). */
  regenerationNote?: string | null;
  requestedBy: string;
  now: string;
  /** When set, replace draft text on this version instead of creating a new exercise. */
  existingExerciseId?: string;
  existingVersionId?: string;
  /**
   * DeepInfra in-provider attempts for transient HTTP/network errors and content retries.
   * Default 1; pass 2 from Regenerate text only (Workflow uses step.do retries).
   */
  providerAttempts?: 1 | 2;
  /** Heartbeat the generation lock between in-provider attempts (Regenerate text). */
  refreshLockAfterProviderAttempt?: () => Promise<void>;
};

export type ExerciseDraftGeneratorDeps = {
  exercises: ExercisesRepository;
  versions: ExerciseVersionsRepository;
  requests: ExerciseRequestsRepository;
};

export type ExerciseDraftGenerator = (
  input: ExerciseDraftGeneratorInput,
  deps: ExerciseDraftGeneratorDeps,
) => Promise<ExerciseDraftGeneratorResult>;
