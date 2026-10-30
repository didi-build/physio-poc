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
    type HttpHandlerConfig = Parameters<typeof createPhysioMcpHttpHandler>[0];
    type ServerConfig = Parameters<typeof createPhysioMcpServer>[0];
    const assertHttp: HttpHandlerConfig extends PhysioServerConfig
      ? PhysioServerConfig extends HttpHandlerConfig
        ? true
        : false
      : false = true;
    const assertServer: ServerConfig extends PhysioServerConfig
      ? PhysioServerConfig extends ServerConfig
        ? true
        : false
      : false = true;
    expect(assertHttp).toBe(true);
    expect(assertServer).toBe(true);
  });
});
