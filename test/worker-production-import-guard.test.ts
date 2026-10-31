import { describe, expect, it } from "vitest";
import { scanWorkerAuthImportGraph } from "../scripts/lib/worker-auth-import-guard.mjs";

describe("Worker production auth import guard fixtures (DIDI-1153)", () => {
  it("flags non-literal dynamic import (X10)", () => {
    const entry =
      "test/fixtures/worker-auth-import-guard/mutations/dynamic-import-variable/entry.ts";
    const { violations } = scanWorkerAuthImportGraph({
      repoRoot: process.cwd(),
      entryPaths: [entry],
    });
    expect(violations.some((v) => v.module === "<non-literal-dynamic-import>")).toBe(
      true,
    );
  });

  it("flags template-literal dynamic import (X11)", () => {
    const entry =
      "test/fixtures/worker-auth-import-guard/mutations/dynamic-import-template/entry.ts";
    const { violations } = scanWorkerAuthImportGraph({
      repoRoot: process.cwd(),
      entryPaths: [entry],
    });
    expect(violations.some((v) => v.module === "<interpolated-dynamic-import>")).toBe(
      true,
    );
  });
});
