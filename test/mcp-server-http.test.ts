import { readFileSync } from "node:fs";
import { join } from "node:path";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
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
  getProgramBuilderLinkInputSchema,
  isValidOpaqueEntityId,
  validateOpaqueEntityId,
} from "../src/mcp-connector/index.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
  toolErrorText,
  withMcpClient,
} from "./mcp-server-test-utils.js";
import { handleRequest } from "../src/http/app.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  publishRoutine,
  seedApprovedExerciseForBuilder,
} from "./helpers/from-routine-http-fixture.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const MCP_HTTP_TEST_BASE = "https://physio-mcp.test.example";

async function mcpHttpFetchWithOwnerRoutine(routineUuid: string) {
  const storage = await openMigratedDatabase();
  const ownerId = testOpaqueEntityId("mcp-http-routine-owner");
  await seedPractitioner(storage, ownerId, "mcp-http-routine@example.com");
  await seedApprovedExerciseForBuilder(storage, ownerId);
  await publishRoutine(storage, ownerId, {
    routine: routineUuid,
    draftVersion: `${routineUuid}-draft`,
    row: `${routineUuid}-row`,
    name: "HTTP MCP seeded routine",
  });
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: ownerId,
      email: "mcp-http-routine@example.com",
      displayName: "HTTP MCP",
    },
  });
  const deps = {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    auth,
    mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
  };
  const cookie = auth.createSessionCookieHeader();
  const fetch: FetchLike = async (input, init) => {
    const parsed = new URL(input instanceof URL ? input.href : input);
    const headers = new Headers(init?.headers);
    headers.set("cookie", cookie);
    return handleRequest(
      new Request(`${MCP_HTTP_TEST_BASE}${parsed.pathname}${parsed.search}`, {
        method: init?.method ?? "GET",
        headers,
        body: init?.body ?? undefined,
      }),
      deps,
    );
  };
  return fetch;
}

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

function encodedQParamLength(searchLink: string): number {
  const search = new URL(searchLink).search.slice(1);
  const prefix = "q=";
  return search.startsWith(prefix) ? search.slice(prefix.length).length : 0;
}

const minimalArgsByTool: Record<string, Record<string, unknown>> = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: { query: "calf stretch" },
  [SEARCH_ROUTINES_TOOL_NAME]: { query: "knee mobility" },
  [GET_PROGRAM_BUILDER_LINK_TOOL_NAME]: {},
};

const TOOLS_FOR_OUTPUT_SCHEMA_SMOKE = PHYSIO_MCP_TOOL_NAMES.filter(
  (name) => name !== GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
);

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
  "assets",
  "compatibility_date",
  "compatibility_flags",
  "d1_databases",
  "main",
  "name",
  "observability",
  "vars",
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
      for (const name of TOOLS_FOR_OUTPUT_SCHEMA_SMOKE) {
        const result = await client.callTool({
          name,
          arguments: minimalArgsByTool[name],
        });
        expect(result.isError, name).not.toBe(true);
        expect(result.structuredContent, name).toBeTruthy();
        const summary = (result.structuredContent as { summary?: string }).summary;
        expect(typeof summary, name).toBe("string");
        expect(String(summary).length, name).toBeGreaterThan(0);

        const tool = getPhysioMcpTool(name);
        expect(tool).toBeDefined();
        const validate = ajv.compile(tool!.outputSchema);
        expect(validate(result.structuredContent), name).toBe(true);
      }
    });
  });

  it("returns empty search results with search_link when nothing matches", async () => {
    const noMatch = "zzzz-mcp-http-no-approved-match";
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        arguments: { query: noMatch },
      });
      expect(result.isError).not.toBe(true);
      const body = result.structuredContent as {
        exercises?: unknown[];
        search_link?: string;
      };
      expect(body.exercises).toEqual([]);
      expect(body.search_link).toBe(
        buildWebAppExerciseSearchUrl(MCP_TEST_CONFIG.webAppBaseUrl, noMatch),
      );
    });
  });

  it("returns builder_link and manage_url for code, routine, and blank inputs", async () => {
    const base = MCP_TEST_CONFIG.webAppBaseUrl;
    const routineId = id("mcp-http-builder-routine");
    const fetch = await mcpHttpFetchWithOwnerRoutine("mcp-http-builder-routine");
    await withMcpClient(
      async (client) => {
        const byRoutine = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id: routineId },
        });
        const routineBody = byRoutine.structuredContent as Record<string, unknown>;
        expect(routineBody.builder_link).toBe(
          `${base}/programs/new?from_routine_id=${routineId}`,
        );
        expect(routineBody.manage_url).toBe(`${base}/programs/new`);
        expect(routineBody.from_routine_id).toBe(routineId);

        const blank = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: {},
        });
        const blankBody = blank.structuredContent as Record<string, unknown>;
        expect(blankBody.builder_link).toBe(`${base}/programs/new`);
        expect(blankBody.manage_url).toBe(`${base}/programs/new`);

        const trimmed = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id: `  ${routineId}  ` },
        });
        const trimmedBody = trimmed.structuredContent as Record<string, unknown>;
        expect(trimmedBody.builder_link).toBe(
          `${base}/programs/new?from_routine_id=${routineId}`,
        );
        expect(trimmedBody.from_routine_id).toBe(routineId);
      },
      { fetch },
    );
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
      expect(result.isError).toBe(true);
      expect(toolErrorText(result)).toMatch(/Routine not found/i);
    });
  });

  it("accepts uppercase UUID v4 in schema and normalizes via validateOpaqueEntityId", async () => {
    const routineId = id("mcp-http-upper-routine");
    const upper = routineId.toUpperCase();
    const lower = routineId.toLowerCase();
    expect(isValidOpaqueEntityId(upper)).toBe(true);
    expect(validateOpaqueEntityId(upper, "from_routine_id")).toBe(lower);
    const schemaValidate = ajv.compile(getProgramBuilderLinkInputSchema);
    expect(schemaValidate({ from_routine_id: upper })).toBe(true);

    const fetch = await mcpHttpFetchWithOwnerRoutine("mcp-http-upper-routine");
    await withMcpClient(
      async (client) => {
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
      },
      { fetch },
    );
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
