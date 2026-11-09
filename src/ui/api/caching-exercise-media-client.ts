import type { ExerciseMediaClient } from "./exercise-media-client.js";
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
  return {
    getRegenerationQuota: (options) => inner.getRegenerationQuota(options),
    regenerateDraftMedia: (input) =>
      afterRegeneration(() => inner.regenerateDraftMedia(input)),
  } as ExerciseMediaClient;
}
