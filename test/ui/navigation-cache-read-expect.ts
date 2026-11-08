import { expect } from "vitest";

/** Second argument on navigation GET clients when loaded via the session read cache hook. */
export const expectReadCacheSignal = { signal: expect.any(AbortSignal) };
