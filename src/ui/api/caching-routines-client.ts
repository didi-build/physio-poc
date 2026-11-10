import type { RoutineExerciseRow } from "../../services/routines/types.js";
import type {
  RoutineDraftDiscardUndo,
  RoutineMutationUndo,
} from "../../services/routines/types.js";
import type { RoutinesClient, RoutineDraftAutosaveInput } from "./routines-client.js";
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
    listMeBodyRegions: (options) => inner.listMeBodyRegions(options),
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
    createRoutineDraft: (input) =>
      withRoutineInvalidation(undefined, () => inner.createRoutineDraft(input)),
    autosaveRoutineDraft: (routineId: string, patch: RoutineDraftAutosaveInput) =>
      withRoutineInvalidation(routineId, () =>
        inner.autosaveRoutineDraft(routineId, patch),
      ),
    cancelUntouchedRoutineDraft: (routineId: string) =>
      withRoutineInvalidation(routineId, () =>
        inner.cancelUntouchedRoutineDraft(routineId),
      ),
    publishRoutineDraft: (routineId: string, input) =>
      withRoutineInvalidation(routineId, () =>
        inner.publishRoutineDraft(routineId, input),
      ),
    discardRoutineDraft: (routineId: string) =>
      withRoutineInvalidation(routineId, () => inner.discardRoutineDraft(routineId)),
    undoRoutineDraftDiscard: (routineId: string, undo: RoutineDraftDiscardUndo) =>
      withRoutineInvalidation(routineId, () =>
        inner.undoRoutineDraftDiscard(routineId, undo),
      ),
    saveRoutineCommunityVersion: (routineId: string, input) =>
      withRoutineInvalidation(routineId, () =>
        inner.saveRoutineCommunityVersion(routineId, input),
      ),
    restoreRoutineVersion: (routineId: string, restoreFromVersionNumber: number) =>
      withRoutineInvalidation(routineId, () =>
        inner.restoreRoutineVersion(routineId, restoreFromVersionNumber),
      ),
    getRoutineVersionHistory: (routineId, options) =>
      inner.getRoutineVersionHistory(routineId, options),
  } as RoutinesClient;
}
