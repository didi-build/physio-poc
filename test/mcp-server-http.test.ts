import { readFileSync } from "node:fs";
import { join } from "node:path";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MCP_TOOL_ANNOTATIONS,
  PATIENT_DETAIL_REJECTION_MESSAGE,
  PHYSIO_MCP_TOOL_NAMES,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  buildStubPublicShareLink,
  buildWebAppExerciseSearchUrl,
  getPhysioMcpTool,
  getProgramBuilderLinkInputSchema,
  isValidOpaqueEntityId,
  validateOpaqueEntityId,
} from "../src/mcp-connector/index.js";
import {
  STUB_DRAFT_ONLY_PROGRAM_CODE,
  STUB_PUBLISHED_ONLY_PROGRAM_CODE,
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

const SAMPLE_ROUTINE_UUID = "550e8400-e29b-41d4-a716-446655440000";

function encodedQParamLength(searchLink: string): number {
  const search = new URL(searchLink).search.slice(1);
  const prefix = "q=";
  return search.startsWith(prefix) ? search.slice(prefix.length).length : 0;
}

const minimalArgsByTool: Record<string, Record<string, unknown>> = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: { query: "calf stretch" },
  [SEARCH_ROUTINES_TOOL_NAME]: { query: "knee mobility" },
  [GET_PROGRAM_BUILDER_LINK_TOOL_NAME]: { program_code: "PRG-STUB01" },
  [GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME]: { program_code: "PRG-STUB01" },
};

function parseWranglerJsonc(text: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => printParseErrorCode(entry.error)).join(", "));
  }
  if (
    parsed === undefined ||
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Expected wrangler.jsonc root object");
  }
  return parsed as Record<string, unknown>;
}

const EXPECTED_WRANGLER_TOP_LEVEL_KEYS = [
  "compatibility_date",
  "compatibility_flags",
  "d1_databases",
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

  it("returns builder_link and manage_url for code, routine, and blank inputs", async () => {
    const base = MCP_TEST_CONFIG.webAppBaseUrl;
    await withMcpClient(async (client) => {
      const byCode = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { program_code: "PRG-STUB01" },
      });
      expect(byCode.isError).not.toBe(true);
      const codeBody = byCode.structuredContent as Record<string, unknown>;
      expect(codeBody.builder_link).toBe(`${base}/programs/PRG-STUB01`);
      expect(codeBody.manage_url).toBe(`${base}/programs/PRG-STUB01`);
      expect(codeBody.program_code).toBe("PRG-STUB01");
      expect(codeBody.from_routine_id).toBeUndefined();

      const byRoutine = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { from_routine_id: SAMPLE_ROUTINE_UUID },
      });
      const routineBody = byRoutine.structuredContent as Record<string, unknown>;
      expect(routineBody.builder_link).toBe(
        `${base}/programs/new?from_routine_id=${SAMPLE_ROUTINE_UUID}`,
      );
      expect(routineBody.manage_url).toBe(`${base}/programs/new`);
      expect(routineBody.from_routine_id).toBe(SAMPLE_ROUTINE_UUID);

      const blank = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: {},
      });
      const blankBody = blank.structuredContent as Record<string, unknown>;
      expect(blankBody.builder_link).toBe(`${base}/programs/new`);
      expect(blankBody.manage_url).toBe(`${base}/programs/new`);

      const both = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: {
          program_code: "PRG-STUB01",
          from_routine_id: SAMPLE_ROUTINE_UUID,
        },
      });
      const bothBody = both.structuredContent as Record<string, unknown>;
      expect(bothBody.builder_link).toBe(`${base}/programs/PRG-STUB01`);
      expect(bothBody.program_code).toBe("PRG-STUB01");
      expect(bothBody.from_routine_id).toBeUndefined();

      const trimmed = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { from_routine_id: `  ${SAMPLE_ROUTINE_UUID}  ` },
      });
      const trimmedBody = trimmed.structuredContent as Record<string, unknown>;
      expect(trimmedBody.builder_link).toBe(
        `${base}/programs/new?from_routine_id=${SAMPLE_ROUTINE_UUID}`,
      );
      expect(trimmedBody.from_routine_id).toBe(SAMPLE_ROUTINE_UUID);
    });
  });

  it("caps search_link encoded q at 199 when pre-encoding length is 199, 200, or 201", async () => {
    const accentPrefix = "é".repeat(33);
    const query199 = `${accentPrefix}a`;
    const query200 = `${accentPrefix}aa`;
    const query201 = `${accentPrefix}aaa`;
    expect(query199.length).toBeLessThanOrEqual(100);
    expect(query200.length).toBeLessThanOrEqual(100);
    expect(query201.length).toBeLessThanOrEqual(100);

    await withMcpClient(async (client) => {
      const at199 = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: query199 },
      });
      expect(at199.isError).not.toBe(true);
      const link199 = (at199.structuredContent as { search_link?: string }).search_link;
      expect(link199).toBeTruthy();
      expect(encodedQParamLength(link199!)).toBe(199);

      const at200 = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: query200 },
      });
      const link200 = (at200.structuredContent as { search_link?: string }).search_link;
      expect(encodedQParamLength(link200!)).toBe(199);

      const at201 = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: query201 },
      });
      const link201 = (at201.structuredContent as { search_link?: string }).search_link;
      expect(encodedQParamLength(link201!)).toBe(199);
    });
  });

  it("returns share_link, pdf_url, publish_link, and manage_link for each stub share state", async () => {
    const base = MCP_TEST_CONFIG.webAppBaseUrl;
    const shareUrl = buildStubPublicShareLink(base);
    const pdfUrl = `${shareUrl}.pdf`;

    await withMcpClient(async (client) => {
      const draftOnly = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { program_code: STUB_DRAFT_ONLY_PROGRAM_CODE },
      });
      const draftBody = draftOnly.structuredContent as Record<string, unknown>;
      expect(draftBody.share_link).toBe("");
      expect(draftBody.pdf_url).toBe("");
      expect(draftBody.publish_link).toBe(
        `${base}/programs/${STUB_DRAFT_ONLY_PROGRAM_CODE}/publish`,
      );
      expect(draftBody.manage_link).toBe(
        `${base}/programs/${STUB_DRAFT_ONLY_PROGRAM_CODE}/share`,
      );
      expect(draftBody.manage_url).toBe(
        `${base}/programs/${STUB_DRAFT_ONLY_PROGRAM_CODE}`,
      );

      const publishedOnly = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { program_code: STUB_PUBLISHED_ONLY_PROGRAM_CODE },
      });
      const pubBody = publishedOnly.structuredContent as Record<string, unknown>;
      expect(pubBody.share_link).toBe(shareUrl);
      expect(pubBody.pdf_url).toBe(pdfUrl);
      expect(pubBody.publish_link).toBe("");
      expect(pubBody.manage_link).toBe(
        `${base}/programs/${STUB_PUBLISHED_ONLY_PROGRAM_CODE}/share`,
      );
      expect(pubBody.manage_url).toBe(
        `${base}/programs/${STUB_PUBLISHED_ONLY_PROGRAM_CODE}`,
      );
      expect(pubBody.draft).toBeNull();

      const draftAndPublished = await client.callTool({
        name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        arguments: { program_code: "PRG-STUB01" },
      });
      const bothBody = draftAndPublished.structuredContent as Record<string, unknown>;
      expect(bothBody.share_link).toBe(shareUrl);
      expect(bothBody.pdf_url).toBe(pdfUrl);
      expect(bothBody.publish_link).toBe(`${base}/programs/PRG-STUB01/publish`);
      expect(bothBody.manage_link).toBe(`${base}/programs/PRG-STUB01/share`);
      expect(bothBody.manage_url).toBe(`${base}/programs/PRG-STUB01`);
      expect(bothBody.draft).not.toBeNull();
      expect(bothBody.published).not.toBeNull();
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

  it("rejects readable slugs and free text for from_routine_id", async () => {
    const rejects = [
      "rtn-john-smith-knee",
      "john-smith-knee",
      "Knee mobility starter, neck and shoulder",
    ];
    await withMcpClient(async (client) => {
      for (const from_routine_id of rejects) {
        const result = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id },
        });
        expect(result.isError, from_routine_id).toBe(true);
        expect(toolErrorText(result)).toMatch(/must match pattern/i);
      }
    });
  });

  it("accepts a generated UUID v4 for from_routine_id", async () => {
    const generatedId = crypto.randomUUID();
    expect(isValidOpaqueEntityId(generatedId)).toBe(true);
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { from_routine_id: generatedId },
      });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as { from_routine_id?: string };
      expect(body.from_routine_id).toBe(generatedId.toLowerCase());
    });
  });

  it("accepts uppercase UUID v4 in schema and normalizes via validateOpaqueEntityId", async () => {
    const upper = "550E8400-E29B-41D4-A716-446655440000";
    const lower = upper.toLowerCase();
    expect(isValidOpaqueEntityId(upper)).toBe(true);
    expect(validateOpaqueEntityId(upper, "from_routine_id")).toBe(lower);
    const schemaValidate = ajv.compile(getProgramBuilderLinkInputSchema);
    expect(schemaValidate({ from_routine_id: upper })).toBe(true);

    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { from_routine_id: upper },
      });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as {
        from_routine_id?: string;
        builder_link?: string;
      };
      expect(body.from_routine_id).toBe(lower);
      expect(body.builder_link).toBe(
        `${MCP_TEST_CONFIG.webAppBaseUrl}/programs/new?from_routine_id=${lower}`,
      );
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
  it("rejects jsonc with parse errors", () => {
    expect(() => parseWranglerJsonc('{"name": "physio-poc",')).toThrow(
      /CloseBraceExpected/,
    );
  });

  it("rejects a JSON array root", () => {
    expect(() => parseWranglerJsonc("[]")).toThrow(
      "Expected wrangler.jsonc root object",
    );
  });

  it("rejects a JSON string scalar root", () => {
    expect(() => parseWranglerJsonc('"x"')).toThrow(
      "Expected wrangler.jsonc root object",
    );
  });

  it("uses the physio-poc worker name", () => {
    const wranglerPath = join(process.cwd(), "wrangler.jsonc");
    const text = readFileSync(wranglerPath, "utf8");
    const parsed = parseWranglerJsonc(text);
    expect(parsed.name).toBe("physio-poc");
  });

  it("allows only expected top-level keys", () => {
    const wranglerPath = join(process.cwd(), "wrangler.jsonc");
    const text = readFileSync(wranglerPath, "utf8");
    const parsed = parseWranglerJsonc(text);
    expect(Object.keys(parsed).sort()).toEqual(EXPECTED_WRANGLER_TOP_LEVEL_KEYS);
  });
});
