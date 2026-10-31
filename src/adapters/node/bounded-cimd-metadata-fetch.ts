import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

export const BOUNDED_CIMD_DEFAULT_MAX_BYTES = 64 * 1024;
export const BOUNDED_CIMD_DEFAULT_TIMEOUT_MS = 5000;

function mergeAbortSignals(
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  if (!callerSignal) {
    return timeoutSignal;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([callerSignal, timeoutSignal]);
  }
  const merged = new AbortController();
  const abortMerged = (): void => {
    merged.abort();
  };
  if (callerSignal.aborted || timeoutSignal.aborted) {
    merged.abort();
    return merged.signal;
  }
  callerSignal.addEventListener("abort", abortMerged, { once: true });
  timeoutSignal.addEventListener("abort", abortMerged, { once: true });
  return merged.signal;
}

export function createBoundedCimdMetadataFetch(
  inner: ClientMetadataResourceFetch,
  options?: { maxBytes?: number; timeoutMs?: number },
): ClientMetadataResourceFetch {
  const maxBytes = options?.maxBytes ?? BOUNDED_CIMD_DEFAULT_MAX_BYTES;
  const timeoutMs = options?.timeoutMs ?? BOUNDED_CIMD_DEFAULT_TIMEOUT_MS;
  return async (input, init) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = mergeAbortSignals(init?.signal ?? undefined, timeoutSignal);
    try {
      const response = await inner(input, {
        ...init,
        signal,
      });
      if (!response.ok) {
        return response;
      }
      const clone = response.clone();
      const reader = clone.body?.getReader();
      if (!reader) {
        return response;
      }
      let total = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        total += chunk.value.byteLength;
        if (total > maxBytes) {
          throw new TypeError("CIMD metadata response exceeded size limit");
        }
      }
      return response;
    } catch (error) {
      if (timeoutSignal.aborted) {
        throw new TypeError("CIMD metadata fetch timed out");
      }
      throw error;
    }
  };
}
