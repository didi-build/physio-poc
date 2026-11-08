import type { ExerciseRequestsClient } from "./exercise-requests-client.js";
import { invalidateAfterExerciseRequestMutation } from "./navigation-read-cache-invalidation.js";

function afterExerciseRequestMutation<T>(run: () => Promise<T>): Promise<T> {
  return run().then((result) => {
    invalidateAfterExerciseRequestMutation();
    return result;
  });
}

/** Pass-through GETs; submit/approve invalidate exercise list navigation cache (DIDI-1185). */
export function wrapExerciseRequestsClientWithCacheInvalidation(
  inner: ExerciseRequestsClient,
): ExerciseRequestsClient {
  return {
    listSimilar: (query) => inner.listSimilar(query),
    listInProgress: () => inner.listInProgress(),
    getInProgressCount: () => inner.getInProgressCount(),
    getRequest: (requestId) => inner.getRequest(requestId),
    updateDraft: (requestId, patch) => inner.updateDraft(requestId, patch),
    submitRequest: (input) =>
      afterExerciseRequestMutation(() => inner.submitRequest(input)),
    approveRequest: (requestId) =>
      afterExerciseRequestMutation(() => inner.approveRequest(requestId)),
  } as ExerciseRequestsClient;
}
