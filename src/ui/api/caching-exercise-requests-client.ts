import type { ExerciseRequestsClient } from "./exercise-requests-client.js";
import type { CacheWrappedClient } from "./caching-client-types.js";
import {
  invalidateAfterExerciseRequestDraftMutation,
  invalidateAfterExerciseRequestMutation,
} from "./navigation-read-cache-invalidation.js";

function afterExerciseRequestMutation<T>(run: () => Promise<T>): Promise<T> {
  return run().then((result) => {
    invalidateAfterExerciseRequestMutation();
    return result;
  });
}

function afterDraftEdit<T>(requestId: string, run: () => Promise<T>): Promise<T> {
  return run().then((result) => {
    invalidateAfterExerciseRequestDraftMutation(requestId);
    return result;
  });
}

/** Pass-through GETs; mutations invalidate session read cache (DIDI-1185 / DIDI-1188). */
export function wrapExerciseRequestsClientWithCacheInvalidation(
  inner: ExerciseRequestsClient,
): ExerciseRequestsClient {
  const wrapped = {
    listSimilar: (query, options) => inner.listSimilar(query, options),
    listInProgress: (options) => inner.listInProgress(options),
    getInProgressCount: (options) => inner.getInProgressCount(options),
    getRequest: (requestId, options) => inner.getRequest(requestId, options),
    updateDraft: (requestId, patch) =>
      afterDraftEdit(requestId, () => inner.updateDraft(requestId, patch)),
    submitRequest: (input) =>
      afterExerciseRequestMutation(() => inner.submitRequest(input)),
    generateRequest: (requestId) =>
      afterDraftEdit(requestId, () => inner.generateRequest(requestId)),
    regenerateDraftText: (requestId, note) =>
      afterDraftEdit(requestId, () => inner.regenerateDraftText(requestId, note)),
    approveRequest: (requestId) =>
      afterExerciseRequestMutation(() => inner.approveRequest(requestId)),
    withdrawRequest: (requestId) =>
      afterExerciseRequestMutation(() => inner.withdrawRequest(requestId)),
  } satisfies CacheWrappedClient<ExerciseRequestsClient>;
  return wrapped as ExerciseRequestsClient;
}
