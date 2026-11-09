import type { MyDefaultsClient } from "./my-defaults-client.js";
import { invalidateAfterMyDefaultsMutation } from "./navigation-read-cache-invalidation.js";

function afterMyDefaultsMutation<T>(run: () => Promise<T>): Promise<T> {
  return run().then((result) => {
    invalidateAfterMyDefaultsMutation();
    return result;
  });
}

/** Pass-through GETs; mutations invalidate my defaults and program builder cache (DIDI-1188). */
export function wrapMyDefaultsClientWithCacheInvalidation(
  inner: MyDefaultsClient,
): MyDefaultsClient {
  return {
    getPage: (options) => inner.getPage(options),
    updateShareLinkExpiry: (expiresIn) =>
      afterMyDefaultsMutation(() => inner.updateShareLinkExpiry(expiresIn)),
    upsertTypeDefault: (type, params) =>
      afterMyDefaultsMutation(() => inner.upsertTypeDefault(type, params)),
    resetTypeDefault: (type) =>
      afterMyDefaultsMutation(() => inner.resetTypeDefault(type)),
  } as MyDefaultsClient;
}
