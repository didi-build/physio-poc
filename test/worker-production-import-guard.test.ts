import { describe, expect, it } from "vitest";
import { scanWorkerAuthImportGraph } from "../scripts/lib/worker-auth-import-guard.mjs";

describe("Worker production auth import guard fixtures (DIDI-1164)", () => {
  it.each([
    {
      label: "non-literal dynamic import",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/dynamic-import-variable/entry.ts",
      predicate: (v: { module: string }) => v.module === "<non-literal-dynamic-import>",
    },
    {
      label: "interpolated template dynamic import",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/dynamic-import-template/entry.ts",
      predicate: (v: { module: string }) =>
        v.module === "<interpolated-dynamic-import>",
    },
    {
      label: "export from",
      entry: "test/fixtures/worker-auth-import-guard/mutations/export-from/entry.ts",
      predicate: (v: { module: string }) => v.module.includes("fake-google-http"),
    },
    {
      label: "literal dynamic import",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/dynamic-import-literal/entry.ts",
      predicate: (v: { module: string }) => v.module.includes("fake-google-http"),
    },
    {
      label: "no-substitution template dynamic import",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/dynamic-import-nosubst/entry.ts",
      predicate: (v: { module: string }) => v.module.includes("fake-google-http"),
    },
    {
      label: "require call",
      entry: "test/fixtures/worker-auth-import-guard/mutations/require-call/entry.ts",
      predicate: (v: { module: string }) => v.module.includes("fake-google-http"),
    },
    {
      label: "import equals require",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/import-equals-require/entry.ts",
      predicate: (v: { module: string }) => v.module.includes("fake-google-http"),
    },
    {
      label: "hash alias import",
      entry: "test/fixtures/worker-auth-import-guard/mutations/hash-alias/entry.ts",
      predicate: (v: { module: string }) => v.module.startsWith("#"),
    },
    {
      label: "unresolved relative import",
      entry:
        "test/fixtures/worker-auth-import-guard/mutations/unresolved-relative/entry.ts",
      predicate: (v: { module: string; specifier?: string }) =>
        v.specifier?.includes("does-not-exist-module") ?? false,
    },
  ])("flags $label", ({ entry, predicate }) => {
    const { violations } = scanWorkerAuthImportGraph({
      repoRoot: process.cwd(),
      entryPaths: [entry],
    });
    expect(violations.some(predicate)).toBe(true);
  });
});
