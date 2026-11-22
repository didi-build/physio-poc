import type { ExerciseMediaClient } from "./exercise-media-client.js";
import type { CacheWrappedClient } from "./caching-client-types.js";
import { invalidateAfterExerciseMediaRegeneration } from "./navigation-read-cache-invalidation.js";

function afterRegeneration<T>(run: () => Promise<T>): Promise<T> {
  return run().then((result) => {
    invalidateAfterExerciseMediaRegeneration();
    return result;
  });
}

/** Pass-through GETs; regenerate invalidates quota cache (DIDI-1188). */
export function wrapExerciseMediaClientWithCacheInvalidation(
  inner: ExerciseMediaClient,
): ExerciseMediaClient {
  const wrapped = {
    getRegenerationQuota: (options) => inner.getRegenerationQuota(options),
    regenerateDraftMedia: (input) =>
      afterRegeneration(() => inner.regenerateDraftMedia(input)),
    draftStillObjectUrl: (exerciseVersionId, which, options) =>
      inner.draftStillObjectUrl(exerciseVersionId, which, options),
  } satisfies CacheWrappedClient<ExerciseMediaClient>;
  return wrapped as ExerciseMediaClient;
}
