import { readFileSync } from "node:fs";
import { join } from "node:path";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import { parse as parseJsonc } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MCP_TOOL_ANNOTATIONS,
  PATIENT_DETAIL_REJECTION_MESSAGE,
  PHYSIO_MCP_TOOL_NAMES,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  buildWebAppExerciseSearchUrl,
  getPhysioMcpTool,
} from "../src/mcp-connector/index.js";
import {
  STUB_DRAFT_ONLY_PROGRAM_CODE,
  STUB_SEARCH_NO_MATCH_QUERY,
} from "../src/services/mcp/stub-tool-handler.js";
import {
  MCP_TEST_CONFIG,
  toolErrorText,
  withMcpClient,
} from "./mcp-server-test-utils.js";

const goldenTools = JSON.parse(
  readFileSync(
    join(process.cwd(), "test/fixtures/physio-mcp-tools.golden.json"),
    "utf8",
  ),
);

const Ajv = AjvModule.default ?? AjvModule;
const addFormats = addFormatsModule.default ?? addFormatsModule;

const ajv = new Ajv({
  strict: false,
  validateFormats: true,
  validateSchema: false,
  allErrors: true,
});
addFormats(ajv);

const patientDetailSample = "Contact user@example.com for updates";

const minimalArgsByTool: Record<string, Record<string, unknown>> = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: { query: "calf stretch" },
  [SEARCH_ROUTINES_TOOL_NAME]: { query: "knee mobility" },
  [GET_PROGRAM_BUILDER_LINK_TOOL_NAME]: { program_code: "PRG-STUB01" },
  [GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME]: { program_code: "PRG-STUB01" },
};

function parseWranglerJsonc(text: string): Record<string, unknown> {
  return parseJsonc(text) as Record<string, unknown>;
}

const EXPECTED_WRANGLER_TOP_LEVEL_KEYS = [
  "compatibility_date",
  "main",
  "name",
  "observability",
];

describe("Physio MCP HTTP handler (Streamable HTTP)", () => {
  it("lists tools deep-equal to the golden fixture with flat input roots", async () => {
    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      expect(tools).toEqual(goldenTools);
      for (const tool of tools ?? []) {
        const schema = tool.inputSchema as Record<string, unknown>;
        expect(schema.type).toBe("object");
        for (const key of ["anyOf", "oneOf", "allOf", "not"] as const) {
          expect(schema[key]).toBeUndefined();
        }
      }
    });
  });

  it("lists read-only tool annotations on every tool", async () => {
    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      for (const tool of tools ?? []) {
        expect(tool.annotations).toEqual(MCP_TOOL_ANNOTATIONS);
      }
    });
  });

  it("returns example structured content for each tool", async () => {
    await withMcpClient(async (client) => {
      for (const name of PHYSIO_MCP_TOOL_NAMES) {
        const result = await client.callTool({
          name,
          arguments: minimalArgsByTool[name],
        });
        expect(result.isError, name).not.toBe(true);
        expect(result.structuredContent, name).toBeTruthy();
        const summary = (result.structuredContent as { summary?: string }).summary;
        expect(String(summary), name).toMatch(/^Example response:/);

        const tool = getPhysioMcpTool(name);
        expect(tool).toBeDefined();
        const validate = ajv.compile(tool!.outputSchema);
        expect(validate(result.structuredContent), name).toBe(true);
      }
    });
  });

  it("returns empty search results with search_link for the fixed no-match query", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: STUB_SEARCH_NO_MATCH_QUERY },
      });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as {
        exercises?: unknown[];
        search_link?: string;
      };
      expect(body.exercises).toEqual([]);
      expect(body.search_link).toBe(
        buildWebAppExerciseSearchUrl(
          MCP_TEST_CONFIG.webAppBaseUrl,
          STUB_SEARCH_NO_MATCH_QUERY,
        ),
      );
    });
  });

  it("returns builder_link from get_program_builder_link", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { program_code: "PRG-STUB01" },
      });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as { builder_link?: string };
      expect(body.builder_link).toBe(
        `${MCP_TEST_CONFIG.webAppBaseUrl}/programs/PRG-STUB01`,
      );
    });
  });

  it("returns publish_link for draft-only get_program_share_link_or_pdf stub", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { program_code: STUB_DRAFT_ONLY_PROGRAM_CODE },
      });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as {
        publish_link?: string;
        share_link?: string;
      };
      expect(body.share_link).toBe("");
      expect(body.publish_link).toBe(
        `${MCP_TEST_CONFIG.webAppBaseUrl}/programs/${STUB_DRAFT_ONLY_PROGRAM_CODE}/publish`,
      );
    });
  });
});

describe("Physio MCP HTTP validation", () => {
  it("rejects get_program_share_link_or_pdf without program_code or program_title", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: {},
      });
      expect(result.isError).toBe(true);
      expect(toolErrorText(result)).toMatch(/program_code or program_title/i);
    });
  });

  it("rejects whitespace-only program_code without program_title", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { program_code: "   " },
      });
      expect(result.isError).toBe(true);
      expect(toolErrorText(result)).toMatch(/program_code or program_title/i);
    });
  });

  it("rejects publish on get_program_share_link_or_pdf", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { program_code: "PRG-STUB01", publish: true },
      });
      expect(result.isError).toBe(true);
      expect(toolErrorText(result)).toMatch(/additional properties/i);
    });
  });

  it("rejects unknown properties on tool inputs", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: "calf", unexpected_field: true },
      });
      expect(result.isError).toBe(true);
      expect(toolErrorText(result)).toMatch(/additional properties/i);
    });
  });

  it("rejects over-cap free-text values", async () => {
    const cases: Array<{ tool: string; args: Record<string, unknown> }> = [
      {
        tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        args: { query: "x".repeat(101) },
      },
      {
        tool: SEARCH_ROUTINES_TOOL_NAME,
        args: { query: "x".repeat(101) },
      },
      {
        tool: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        args: { program_title: "x".repeat(81) },
      },
    ];

    await withMcpClient(async (client) => {
      for (const { tool, args } of cases) {
        const result = await client.callTool({ name: tool, arguments: args });
        expect(result.isError, tool).toBe(true);
        expect(toolErrorText(result), tool).toMatch(/must NOT have more than/i);
      }
    });
  });

  it("rejects patient-detail patterns in every free-text field", async () => {
    const cases: Array<{ tool: string; args: Record<string, unknown> }> = [
      {
        tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        args: { query: patientDetailSample },
      },
      {
        tool: SEARCH_ROUTINES_TOOL_NAME,
        args: { query: patientDetailSample },
      },
      {
        tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        args: { query: "calf", body_region: patientDetailSample },
      },
      {
        tool: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        args: { program_title: patientDetailSample },
      },
      {
        tool: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        args: { from_routine_id: patientDetailSample },
      },
    ];

    await withMcpClient(async (client) => {
      for (const { tool, args } of cases) {
        const result = await client.callTool({ name: tool, arguments: args });
        expect(result.isError, tool).toBe(true);
        expect(toolErrorText(result), tool).toBe(PATIENT_DETAIL_REJECTION_MESSAGE);
      }
    });
  });

  it("rejects patient-detail text in opaque cursor fields", async () => {
    await withMcpClient(async (client) => {
      const searchCursor = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: "calf", cursor: patientDetailSample },
      });
      expect(searchCursor.isError).toBe(true);
      expect(toolErrorText(searchCursor)).toBe(PATIENT_DETAIL_REJECTION_MESSAGE);
    });
  });
});

describe("wrangler worker name pin", () => {
  it("uses the physio-poc worker name", () => {
    const wranglerPath = join(process.cwd(), "wrangler.jsonc");
    const text = readFileSync(wranglerPath, "utf8");
    const parsed = parseWranglerJsonc(text);
    expect(parsed.name).toBe("physio-poc");
  });

  it("allows only expected top-level keys (no bindings)", () => {
    const wranglerPath = join(process.cwd(), "wrangler.jsonc");
    const text = readFileSync(wranglerPath, "utf8");
    const parsed = parseWranglerJsonc(text);
    expect(Object.keys(parsed).sort()).toEqual(EXPECTED_WRANGLER_TOP_LEVEL_KEYS);
  });
});
