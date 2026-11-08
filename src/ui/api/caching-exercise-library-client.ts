import type { TextOverrideKey } from "../../domain/exercise-text-overrides.js";
import type { ExerciseMutationUndo } from "../../services/exercise-library/types.js";
import type {
  ApprovedSearchParams,
  ExerciseLibraryClient,
  MyExercisesListParams,
} from "./exercise-library-client.js";
import { invalidateAfterExerciseLibraryMutation } from "./navigation-read-cache-invalidation.js";

function withExerciseInvalidation<T>(
  exerciseId: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  return run().then((result) => {
    invalidateAfterExerciseLibraryMutation(exerciseId);
    return result;
  });
}

/** Pass-through GETs; mutations invalidate navigation read cache (DIDI-1185). */
export function wrapExerciseLibraryClientWithCacheInvalidation(
  inner: ExerciseLibraryClient,
): ExerciseLibraryClient {
  return {
    searchApproved: (params: ApprovedSearchParams) => inner.searchApproved(params),
    listMyExercises: (params?: MyExercisesListParams) => inner.listMyExercises(params),
    getExerciseDetails: (exerciseId: string) => inner.getExerciseDetails(exerciseId),
    saveToMyExercises: (exerciseId: string) =>
      withExerciseInvalidation(exerciseId, () => inner.saveToMyExercises(exerciseId)),
    setPinned: (exerciseId: string, pinned: boolean) =>
      withExerciseInvalidation(exerciseId, () => inner.setPinned(exerciseId, pinned)),
    removeFromMyExercises: (exerciseId: string) =>
      withExerciseInvalidation(exerciseId, () =>
        inner.removeFromMyExercises(exerciseId),
      ),
    applyUndo: (exerciseId: string, undo: ExerciseMutationUndo) =>
      withExerciseInvalidation(exerciseId, () => inner.applyUndo(exerciseId, undo)),
    updateMyCopy: (
      exerciseId: string,
      body: {
        text_overrides?: Partial<Record<TextOverrideKey, string>>;
        use_library_version?: TextOverrideKey[];
        keep_mine?: TextOverrideKey[];
      },
    ) =>
      withExerciseInvalidation(exerciseId, () => inner.updateMyCopy(exerciseId, body)),
  } as ExerciseLibraryClient;
}
