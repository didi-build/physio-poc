import { describe, expect, it } from "vitest";
import type { PhysioServerConfig } from "../src/http/config.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { createPhysioMcpServer } from "../src/adapters/workers/mcp/create-physio-mcp-server.js";
import {
  assertProductionMcpStubImportGraph,
  isForbiddenMcpStubDependency,
  scanMcpStubImportGraph,
} from "../scripts/lib/mcp-stub-import-guard.mjs";

const REPO_ROOT = process.cwd();

describe("MCP stub import graph guard", () => {
  it("production MCP entry and app-routes reach no storage or non-mcp services", () => {
    const { violations } = assertProductionMcpStubImportGraph(REPO_ROOT);
    expect(violations).toEqual([]);
  });

  it("flags stub handler importing exercise-library service (QA mutation)", () => {
    const entry =
      "test/fixtures/mcp-stub-import-guard/mutations/stub-exercise-service/entry.ts";
    const { violations } = scanMcpStubImportGraph({
      repoRoot: REPO_ROOT,
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(
      violations.some((v) => v.module.includes("src/services/exercise-library")),
    ).toBe(true);
  });

  it("flags validate-tool-input importing a repository (QA mutation)", () => {
    const entry =
      "test/fixtures/mcp-stub-import-guard/mutations/validate-repository/entry.ts";
    const { violations } = scanMcpStubImportGraph({
      repoRoot: REPO_ROOT,
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.module.includes("src/storage/repositories"))).toBe(
      true,
    );
  });

  it("flags static template-literal dynamic import of storage (QA mutation)", () => {
    const entry =
      "test/fixtures/mcp-stub-import-guard/mutations/dynamic-import-template/entry.ts";
    const { violations } = scanMcpStubImportGraph({
      repoRoot: REPO_ROOT,
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.module.includes("src/storage/repositories"))).toBe(
      true,
    );
  });

  it("flags interpolated dynamic import in scanned module (fail closed)", () => {
    const entry =
      "test/fixtures/mcp-stub-import-guard/mutations/dynamic-import-interpolated/entry.ts";
    const { violations } = scanMcpStubImportGraph({
      repoRoot: REPO_ROOT,
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.module === "<interpolated-dynamic-import>")).toBe(
      true,
    );
  });

  it("flags non-literal dynamic import in scanned module (fail closed)", () => {
    const entry =
      "test/fixtures/mcp-stub-import-guard/mutations/dynamic-import-variable/entry.ts";
    const { violations } = scanMcpStubImportGraph({
      repoRoot: REPO_ROOT,
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.module === "<non-literal-dynamic-import>")).toBe(
      true,
    );
  });

  it("flags app-routes importing a repository (QA mutation)", () => {
    const entry =
      "test/fixtures/mcp-stub-import-guard/mutations/app-routes-repository/app-routes.ts";
    const { violations } = scanMcpStubImportGraph({
      repoRoot: REPO_ROOT,
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.module.includes("src/storage/repositories"))).toBe(
      true,
    );
  });

  it("classifies forbidden module paths", () => {
    expect(isForbiddenMcpStubDependency("src/storage/ports/sql-storage.ts")).toBe(true);
    expect(isForbiddenMcpStubDependency("src/services/exercise-library/index.ts")).toBe(
      true,
    );
    expect(isForbiddenMcpStubDependency("src/services/mcp/stub-tool-handler.ts")).toBe(
      false,
    );
    expect(isForbiddenMcpStubDependency("src/mcp-connector/index.ts")).toBe(false);
  });

  it("MCP handler factories accept PhysioServerConfig only", () => {
    type Equals<A, B> =
      (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;

    type HttpParamsEquals = Equals<
      Parameters<typeof createPhysioMcpHttpHandler>,
      [PhysioServerConfig]
    >;
    type ServerParamsEquals = Equals<
      Parameters<typeof createPhysioMcpServer>,
      [PhysioServerConfig]
    >;

    const assertHttp: HttpParamsEquals = true;
    const assertServer: ServerParamsEquals = true;
    expect(assertHttp).toBe(true);
    expect(assertServer).toBe(true);

    type WidenedConfigParam = Equals<
      [PhysioServerConfig & { repo?: unknown }],
      [PhysioServerConfig]
    >;
    type SecondParamFactory = (
      config: PhysioServerConfig,
      repo?: { findById(id: string): Promise<unknown> },
    ) => void;
    type SecondParamEquals = Equals<
      Parameters<SecondParamFactory>,
      [PhysioServerConfig]
    >;

    const widenedParamMutationFails: WidenedConfigParam = false;
    const secondParamMutationFails: SecondParamEquals = false;
    expect(widenedParamMutationFails).toBe(false);
    expect(secondParamMutationFails).toBe(false);
  });
});
