import type { RoutineExerciseRow } from "../../services/routines/types.js";
import type { RoutineMutationUndo } from "../../services/routines/types.js";
import type { RoutinesClient } from "./routines-client.js";
import { invalidateAfterRoutineLibraryMutation } from "./navigation-read-cache-invalidation.js";

function withRoutineInvalidation<T>(
  routineId: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  return run().then((result) => {
    invalidateAfterRoutineLibraryMutation(routineId);
    return result;
  });
}

export function wrapRoutinesClientWithCacheInvalidation(
  inner: RoutinesClient,
): RoutinesClient {
  return {
    searchCommunity: (params, options) => inner.searchCommunity(params, options),
    listMyRoutines: (params, options) => inner.listMyRoutines(params, options),
    getRoutineDetails: (routineId, options) =>
      inner.getRoutineDetails(routineId, options),
    saveToMyRoutines: (routineId: string) =>
      withRoutineInvalidation(routineId, () => inner.saveToMyRoutines(routineId)),
    removeFromMyRoutines: (routineId: string) =>
      withRoutineInvalidation(routineId, () => inner.removeFromMyRoutines(routineId)),
    adoptCommunityVersion: (routineId: string) =>
      withRoutineInvalidation(routineId, () => inner.adoptCommunityVersion(routineId)),
    keepMyCopyVersion: (routineId: string) =>
      withRoutineInvalidation(routineId, () => inner.keepMyCopyVersion(routineId)),
    applyUndo: (routineId: string, undo: RoutineMutationUndo) =>
      withRoutineInvalidation(routineId, () => inner.applyUndo(routineId, undo)),
    updateMyCopy: (routineId: string, rows: RoutineExerciseRow[]) =>
      withRoutineInvalidation(routineId, () => inner.updateMyCopy(routineId, rows)),
  } as RoutinesClient;
}
