import { describe, expect, it } from "vitest";
import {
  assertWorkerProductionProcessEnvGuard,
  scanWorkerProductionProcessEnvUsage,
} from "../scripts/lib/worker-process-env-guard.mjs";

describe("Worker production process.env guard (DIDI-1153)", () => {
  it("finds no process.env reads in the Worker production entry graph", () => {
    const { violations } = assertWorkerProductionProcessEnvGuard(process.cwd());
    expect(violations).toEqual([]);
  });

  it("flags process.env reads reachable from a mutation entry (X9-style)", () => {
    const entry =
      "test/fixtures/worker-auth-import-guard/mutations/process-env-read/entry.ts";
    const { violations } = scanWorkerProductionProcessEnvUsage({
      repoRoot: process.cwd(),
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((path) => path.includes("process-env-read"))).toBe(true);
  });
});
