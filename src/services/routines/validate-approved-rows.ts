import type { ExerciseLibraryReadRepository } from "../../storage/repositories/exercise-library-read.js";

export type RoutineRowExerciseRef = {
  exerciseId: string;
  exerciseVersionId: string;
};

export async function findUnapprovedRoutineRow(
  exerciseRead: ExerciseLibraryReadRepository,
  rows: RoutineRowExerciseRef[],
): Promise<RoutineRowExerciseRef | null> {
  for (const row of rows) {
    const version = await exerciseRead.getApprovedVersionById(row.exerciseVersionId);
    if (!version || version.exercise_id !== row.exerciseId) {
      return row;
    }
  }
  return null;
}
