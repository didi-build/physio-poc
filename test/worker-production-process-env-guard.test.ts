import { describe, expect, it } from "vitest";
import {
  assertWorkerProductionProcessEnvGuard,
  scanWorkerProductionProcessEnvUsage,
} from "../scripts/lib/worker-process-env-guard.mjs";

describe("Worker production process guard (DIDI-1164)", () => {
  it("finds no process usage in the Worker production entry graph", () => {
    const { violations } = assertWorkerProductionProcessEnvGuard(process.cwd());
    expect(violations).toEqual([]);
  });

  it.each([
    {
      label: "process.env property access",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/process-env-read/entry.ts",
      needle: "process-env-read",
    },
    {
      label: "process bracket env access",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/process-bracket-env/entry.ts",
      needle: "process-bracket-env",
    },
    {
      label: "globalThis.process",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/process-global-this/entry.ts",
      needle: "process-global-this",
    },
    {
      label: "node:process import",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/process-node-import/entry.ts",
      needle: "process-node-import",
    },
    {
      label: "destructure env from process",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/process-destructure/entry.ts",
      needle: "process-destructure",
    },
  ])("flags $label reachable from a mutation entry", ({ entry, needle }) => {
    const { violations } = scanWorkerProductionProcessEnvUsage({
      repoRoot: process.cwd(),
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((path) => path.includes(needle))).toBe(true);
  });
});
