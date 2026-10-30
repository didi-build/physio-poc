import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";

const DEFAULT_MAX_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;

export function createBoundedCimdMetadataFetch(
  inner: ClientMetadataResourceFetch,
  options?: { maxBytes?: number; timeoutMs?: number },
): ClientMetadataResourceFetch {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await inner(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
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
    } finally {
      clearTimeout(timer);
    }
  };
}
