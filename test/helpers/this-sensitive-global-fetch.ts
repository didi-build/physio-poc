import { vi } from "vitest";

/** Stubs global `fetch` to throw when invoked with a bound `this` (workerd illegal-invocation shape). */
export function stubThisSensitiveGlobalFetch(
  respond: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const impl = vi.fn(function (
    this: unknown,
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation: fetch called with bound this");
    }
    return Promise.resolve(respond(input, init));
  });
  vi.stubGlobal("fetch", impl);
  return impl;
}
