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
