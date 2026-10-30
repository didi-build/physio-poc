import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
} from "../src/mcp-connector/index.js";
import type { PhysioServerConfig } from "../src/http/config.js";
import {
  STUB_DRAFT_ONLY_PROGRAM_CODE,
  STUB_GET_PROGRAM_BUILDER_LINK_SUMMARY,
  STUB_GET_PROGRAM_SHARE_DRAFT_AND_PUBLISHED_SUMMARY,
  STUB_GET_PROGRAM_SHARE_DRAFT_ONLY_SUMMARY,
  STUB_GET_PROGRAM_SHARE_PUBLISHED_ONLY_SUMMARY,
  STUB_PUBLISHED_ONLY_PROGRAM_CODE,
  invokePhysioMcpStubTool,
} from "../src/services/mcp/stub-tool-handler.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { assertProductionMcpStubImportGraph } from "../scripts/lib/mcp-stub-import-guard.mjs";

const REPO_ROOT = process.cwd();

describe("MCP stub handler (placeholder-only until DIDI-1043)", () => {
  it("pins the four model-facing placeholder summaries for builder and share tools", () => {
    expect(STUB_GET_PROGRAM_BUILDER_LINK_SUMMARY).toBe(
      "Example response: Placeholder builder link; no stored program data.",
    );
    expect(STUB_GET_PROGRAM_SHARE_DRAFT_ONLY_SUMMARY).toBe(
      "Example response: Placeholder draft-only program; no stored data.",
    );
    expect(STUB_GET_PROGRAM_SHARE_PUBLISHED_ONLY_SUMMARY).toBe(
      "Example response: Placeholder published program; no stored data.",
    );
    expect(STUB_GET_PROGRAM_SHARE_DRAFT_AND_PUBLISHED_SUMMARY).toBe(
      "Example response: Placeholder published program with a newer draft; no stored data.",
    );
  });

  it("returns pinned summaries from stub tool calls", async () => {
    const config: PhysioServerConfig = MCP_TEST_CONFIG;

    const builder = await invokePhysioMcpStubTool(
      GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
      {},
      config,
    );
    expect(builder.summary).toBe(STUB_GET_PROGRAM_BUILDER_LINK_SUMMARY);

    const draft = await invokePhysioMcpStubTool(
      GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
      { program_code: STUB_DRAFT_ONLY_PROGRAM_CODE },
      config,
    );
    expect(draft.summary).toBe(STUB_GET_PROGRAM_SHARE_DRAFT_ONLY_SUMMARY);

    const published = await invokePhysioMcpStubTool(
      GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
      { program_code: STUB_PUBLISHED_ONLY_PROGRAM_CODE },
      config,
    );
    expect(published.summary).toBe(STUB_GET_PROGRAM_SHARE_PUBLISHED_ONLY_SUMMARY);

    const both = await invokePhysioMcpStubTool(
      GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
      { program_code: "PRG-STUB01" },
      config,
    );
    expect(both.summary).toBe(STUB_GET_PROGRAM_SHARE_DRAFT_AND_PUBLISHED_SUMMARY);
  });

  it("does not transitively import storage or non-mcp services from the MCP entry graph", () => {
    const { violations } = assertProductionMcpStubImportGraph(REPO_ROOT);
    expect(violations).toEqual([]);
  });

  it("returns the same fixed output regardless of app storage wiring", async () => {
    const config: PhysioServerConfig = {
      webAppBaseUrl: "https://stub-isolated.example",
    };
    const args = { query: "calf stretch" };
    const first = await invokePhysioMcpStubTool(
      SEARCH_APPROVED_EXERCISES_TOOL_NAME,
      args,
      config,
    );
    const second = await invokePhysioMcpStubTool(
      SEARCH_APPROVED_EXERCISES_TOOL_NAME,
      args,
      config,
    );
    expect(second).toEqual(first);
    expect(first.exercises).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ exercise_version_id: "ex-v-stub-001" }),
      ]),
    );
  });

  it("lists only expected files under services/mcp for stub implementation", () => {
    const mcpDir = join(process.cwd(), "src/services/mcp");
    const entries = readdirSync(mcpDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    expect(entries).toEqual(["stub-tool-handler.ts", "validate-tool-input.ts"].sort());
    expect(readdirSync(join(mcpDir, "generated")).sort()).toContain(
      "input-validators.js",
    );
  });
});
