import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_PHYSIO_APP_ROUTE_NAMES,
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MCP_TOOL_ANNOTATIONS,
  PHYSIO_APP_ROUTE_PATTERNS,
  buildProgramBuilderLink,
  buildWebAppExerciseSearchUrl,
  getProgramShareLinkOrPdfInputSchema,
  inferGetProgramDisplayState,
  PATIENT_DETAIL_REJECTION_MESSAGE,
  PHYSIO_MCP_TOOLS,
  publishedLinkFieldsPresent,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  validateFreeTextForPatientDetails,
  type JsonSchema,
} from "../src/mcp-connector/index.js";
import {
  MCP_SAMPLE_GET_PROGRAM_BOTH_OUTPUT,
  MCP_SAMPLE_GET_PROGRAM_BUILDER_FROM_ROUTINE_OUTPUT,
  MCP_SAMPLE_GET_PROGRAM_BUILDER_OUTPUT,
  MCP_SAMPLE_GET_PROGRAM_DRAFT_ONLY_OUTPUT,
  MCP_SAMPLE_GET_PROGRAM_PUBLISHED_OUTPUT,
  MCP_SAMPLE_SEARCH_EXERCISES_OUTPUT,
  MCP_SAMPLE_SEARCH_ROUTINES_OUTPUT,
} from "./mcp-connector-schema-samples.js";
import {
  collectInputUrlLikeViolations,
  visitSchemaNodes,
} from "./mcp-connector-schema-test-utils.js";

const MCP_CONNECTOR_DIR = join(process.cwd(), "src/mcp-connector");
const APP_ROUTES_PATH = join(process.cwd(), "src/app-routes.ts");

const LOCKED_TOOL_NAMES = [
  "search_approved_exercises",
  "search_routines",
  "get_program_builder_link",
  "get_program_share_link_or_pdf",
] as const;

const FORBIDDEN_WRITE_INPUT_PROPERTY_NAMES = ["publish", "overrides", "rows"] as const;

/** Property names allowed anywhere in each tool's input or output schema (update when schemas change). */
const ALLOWED_SCHEMA_PROPERTY_NAMES: Record<
  string,
  { input: readonly string[]; output: readonly string[] }
> = {
  search_approved_exercises: {
    input: ["query", "category", "body_region", "prescription_type", "limit", "cursor"],
    output: [
      "summary",
      "share_link",
      "manage_url",
      "exercises",
      "next_cursor",
      "search_link",
      "exercise_version_id",
      "exercise_name",
      "category",
      "body_regions",
      "allowed_prescription_types",
    ],
  },
  search_routines: {
    input: ["query", "limit", "cursor"],
    output: [
      "summary",
      "share_link",
      "manage_url",
      "routines",
      "next_cursor",
      "routine_id",
      "routine_name",
      "routine_version",
      "exercise_count",
      "source",
    ],
  },
  get_program_builder_link: {
    input: ["program_code", "from_routine_id"],
    output: [
      "summary",
      "share_link",
      "builder_link",
      "manage_url",
      "program_code",
      "from_routine_id",
    ],
  },
  get_program_share_link_or_pdf: {
    input: ["program_code", "program_title"],
    output: [
      "summary",
      "share_link",
      "manage_url",
      "pdf_url",
      "publish_link",
      "manage_link",
      "expires_at",
      "draft",
      "published",
      "version",
      "updated_at",
      "program_code",
      "program_title",
      "ambiguous_program_matches",
    ],
  },
};

const PATIENT_INFO_PROPERTY_PATTERNS: readonly RegExp[] = [
  /patient/i,
  /first_name/i,
  /last_name/i,
  /full_name/i,
  /given_name/i,
  /family_name/i,
  /client_name/i,
  /^name$/i,
  /email/i,
  /phone/i,
  /mobile/i,
  /phone_number/i,
  /address/i,
  /dob/i,
  /date_of_birth/i,
  /birth_date/i,
  /client_dob/i,
  /diagnosis/i,
  /condition/i,
  /mrn/i,
  /health_card/i,
  /gender/i,
  /\bsex\b/i,
  /\bage\b/i,
  /contact_/i,
];

function isPatientInfoPropertyName(name: string): boolean {
  if (
    name === "exercise_name" ||
    name === "routine_name" ||
    name === "requested_exercise_name" ||
    name === "program_title"
  ) {
    return false;
  }
  return PATIENT_INFO_PROPERTY_PATTERNS.some((pattern) => pattern.test(name));
}

function collectPropertyNames(schema: JsonSchema, into: Set<string>): void {
  visitSchemaNodes(schema, (node) => {
    const props = node.properties;
    if (props && typeof props === "object") {
      for (const key of Object.keys(props as Record<string, unknown>)) {
        into.add(key);
      }
    }
  });
}

function assertNestedObjectsClosed(schema: JsonSchema, label: string): void {
  visitSchemaNodes(schema, (node) => {
    if (node.type === "object" && node.additionalProperties !== false) {
      throw new Error(`${label}: object schema must set additionalProperties: false`);
    }
  });
}

function listConnectorFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listConnectorFiles(path));
    else if (/\.(ts|tsx|js|mjs|cjs|mts|cts)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const require = createRequire(import.meta.url);
const AjvCtor =
  require("ajv/dist/2020.js") as typeof import("ajv/dist/2020.js").default;
const addFormats = require("ajv-formats") as (
  ajv: InstanceType<typeof AjvCtor>,
) => void;
const ajv = new AjvCtor({ allErrors: true, strict: false });
addFormats(ajv);

describe("Physio MCP connector contract", () => {
  it("pins tool names against locked literals", () => {
    expect(PHYSIO_MCP_TOOLS).toHaveLength(4);
    expect(PHYSIO_MCP_TOOLS.map((t) => t.name)).toEqual([...LOCKED_TOOL_NAMES]);
  });

  it("pins readOnlyHint, destructiveHint, and openWorldHint on every tool", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(tool.annotations, tool.name).toEqual(MCP_TOOL_ANNOTATIONS);
    }
  });

  it("has no create, edit, publish, or delete inputs on any tool", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      const found = new Set<string>();
      collectPropertyNames(tool.inputSchema, found);
      for (const forbidden of FORBIDDEN_WRITE_INPUT_PROPERTY_NAMES) {
        expect(found.has(forbidden), `${tool.name} input ${forbidden}`).toBe(false);
      }
    }
  });

  it("builds connector deep links only through the shared route table", () => {
    const routeSource = readFileSync(APP_ROUTES_PATH, "utf8");
    for (const routeName of CONNECTOR_PHYSIO_APP_ROUTE_NAMES) {
      expect(routeSource).toContain(`${routeName}:`);
      expect(PHYSIO_APP_ROUTE_PATTERNS[routeName]).toBeTruthy();
    }
    expect(
      buildProgramBuilderLink("https://app.example.com", { program_code: "PRG-7K3Q" }),
    ).toBe("https://app.example.com/programs/PRG-7K3Q");
  });

  it("requires top-level type object on every input and output schema", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(tool.inputSchema.type, `${tool.name} input`).toBe("object");
      expect(tool.outputSchema.type, `${tool.name} output`).toBe("object");
    }
  });

  it("passes MCP SDK ToolSchema for each tool", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      const parsed = ToolSchema.safeParse({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      });
      expect(
        parsed.success,
        JSON.stringify(parsed.success ? "" : parsed.error?.format()),
      ).toBe(true);
    }
  });

  it("validates sample outputs with ajv and rejects invalid payloads", () => {
    const cases: Array<{
      tool: string;
      schema: JsonSchema;
      valid: object;
      invalid: object;
    }> = [
      {
        tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        schema: PHYSIO_MCP_TOOLS[0].outputSchema,
        valid: MCP_SAMPLE_SEARCH_EXERCISES_OUTPUT,
        invalid: { summary: "x" },
      },
      {
        tool: SEARCH_ROUTINES_TOOL_NAME,
        schema: PHYSIO_MCP_TOOLS[1].outputSchema,
        valid: MCP_SAMPLE_SEARCH_ROUTINES_OUTPUT,
        invalid: { summary: "x", share_link: "", manage_url: "", routines: "bad" },
      },
      {
        tool: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        schema: PHYSIO_MCP_TOOLS[2].outputSchema,
        valid: MCP_SAMPLE_GET_PROGRAM_BUILDER_OUTPUT,
        invalid: { summary: "x", share_link: "", builder_link: "not-a-url" },
      },
      {
        tool: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        schema: PHYSIO_MCP_TOOLS[3].outputSchema,
        valid: MCP_SAMPLE_GET_PROGRAM_PUBLISHED_OUTPUT,
        invalid: { summary: "x" },
      },
    ];

    for (const { tool, schema, valid, invalid } of cases) {
      const validate = ajv.compile(schema);
      expect(validate(valid), `${tool} valid sample`).toBe(true);
      expect(validate(invalid), `${tool} invalid sample`).toBe(false);
    }
  });

  it("accepts empty share_link, pdf_url, and publish_link where documented", () => {
    const validate = ajv.compile(PHYSIO_MCP_TOOLS[3].outputSchema);
    expect(validate(MCP_SAMPLE_GET_PROGRAM_DRAFT_ONLY_OUTPUT)).toBe(true);
    expect(validate(MCP_SAMPLE_GET_PROGRAM_BOTH_OUTPUT)).toBe(true);
    expect(
      ajv.compile(PHYSIO_MCP_TOOLS[2].outputSchema)(
        MCP_SAMPLE_GET_PROGRAM_BUILDER_FROM_ROUTINE_OUTPUT,
      ),
    ).toBe(true);
  });

  it("pins allowed property names per tool and rejects patient-info-like names", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      const allowed = ALLOWED_SCHEMA_PROPERTY_NAMES[tool.name];
      expect(allowed, `missing allow list for ${tool.name}`).toBeDefined();

      for (const [side, schema] of [
        ["input", tool.inputSchema],
        ["output", tool.outputSchema],
      ] as const) {
        assertNestedObjectsClosed(schema, `${tool.name} ${side}`);
        const found = new Set<string>();
        collectPropertyNames(schema, found);
        const expected = new Set(side === "input" ? allowed.input : allowed.output);
        expect(found, `${tool.name} ${side} property drift`).toEqual(expected);

        for (const name of found) {
          expect(
            isPatientInfoPropertyName(name),
            `forbidden property name ${name} on ${tool.name} ${side}`,
          ).toBe(false);
        }
      }
    }
  });

  it("has no URL-like fields on any tool input schema", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      visitSchemaNodes(tool.inputSchema, (node) => {
        if (node.patternProperties) {
          throw new Error(`${tool.name}: patternProperties is not allowed`);
        }
      });
      const violations = collectInputUrlLikeViolations(tool.inputSchema);
      expect(violations, `${tool.name} input URL-like violations`).toEqual([]);
    }
  });

  it("rejects zero-result exercise search output without search_link", () => {
    const validate = ajv.compile(PHYSIO_MCP_TOOLS[0].outputSchema);
    expect(validate(MCP_SAMPLE_SEARCH_EXERCISES_OUTPUT)).toBe(true);
    expect(
      validate({
        summary: "No matches",
        share_link: "",
        manage_url: "https://app.example.com/exercises",
        exercises: [],
      }),
    ).toBe(false);
  });

  it("uses flat object roots on every tool input schema (no root combinators)", () => {
    const forbiddenRootKeys = [
      "anyOf",
      "oneOf",
      "allOf",
      "not",
      "if",
      "then",
      "else",
    ] as const;
    for (const tool of PHYSIO_MCP_TOOLS) {
      const schema = tool.inputSchema;
      expect(schema.type, `${tool.name} input root type`).toBe("object");
      for (const key of forbiddenRootKeys) {
        expect(schema[key], `${tool.name} input root ${key}`).toBeUndefined();
      }
    }
  });

  it("detects nested URL-like input schema shapes in the guard helper", () => {
    const nested: JsonSchema = {
      type: "object",
      properties: {
        nested_choice: {
          oneOf: [{ type: "string", format: "iri" }, { type: "string" }],
        },
        web_app_base_url: { type: "string", pattern: "^https://" },
      },
    };
    expect(collectInputUrlLikeViolations(nested).sort()).toEqual(
      ["format:iri", "pattern:^https://", "property:web_app_base_url"].sort(),
    );
  });

  it("guards src/mcp-connector against platform imports and bindings", () => {
    const forbiddenSpecifiers =
      /(?:from\s+["'](?!\.)([^"']+)["'])|(?:import\s*["'](?!\.)([^"']+)["'])|(?:import\s*\(\s*["'](?!\.)([^"']+)["'])|(?:require\s*\(\s*["'](?!\.)([^"']+)["'])/;
    const bannedTokens = [
      /\bprocess\./,
      /globalThis\.env/,
      /\bR2Bucket\b/,
      /\bD1Database\b/,
      /\bKVNamespace\b/,
      /\bDurableObjectNamespace\b/,
    ];

    for (const file of listConnectorFiles(MCP_CONNECTOR_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        expect(
          forbiddenSpecifiers.test(line),
          `non-relative import in ${file}: ${line}`,
        ).toBe(false);
      }
      for (const token of bannedTokens) {
        expect(token.test(source), `banned token in ${file}`).toBe(false);
      }
    }
  });

  it("guards the route table module against platform imports", () => {
    const source = readFileSync(APP_ROUTES_PATH, "utf8");
    expect(source).not.toMatch(/\bprocess\./);
    expect(source).not.toMatch(/from\s+["']node:/);
  });

  it("buildWebAppExerciseSearchUrl uses the shared exerciseSearch route", () => {
    expect(PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch).toBe("/exercises/search");

    expect(
      buildWebAppExerciseSearchUrl("https://app.example.com/", "Glute bridge"),
    ).toBe("https://app.example.com/exercises/search?q=Glute+bridge");

    const tricky = "A & B? C# café 测试";
    const url = buildWebAppExerciseSearchUrl("https://app.example.com", tricky);
    expect(url.startsWith("https://app.example.com/exercises/search?")).toBe(true);
    const params = new URLSearchParams(url.split("?")[1] ?? "");
    expect(params.get("q")).toBe(tricky);

    const raw201 = "a".repeat(201);
    const capped = buildWebAppExerciseSearchUrl("https://app.example.com", raw201);
    const search = new URL(capped).search.slice(1);
    const encodedQ = search.startsWith("q=") ? search.slice(2) : "";
    expect(encodedQ.length).toBe(199);

    const flagged = buildWebAppExerciseSearchUrl(
      "https://app.example.com",
      "Contact user@example.com",
    );
    expect(flagged).toBe(
      `https://app.example.com${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}`,
    );
  });
});

describe("validateFreeTextForPatientDetails", () => {
  it("accepts benign exercise and dose text", () => {
    for (const text of [
      "Heel slides, 3 x 10",
      "3x10 each side",
      "30 s hold between reps",
    ]) {
      expect(validateFreeTextForPatientDetails(text)).toEqual({ ok: true });
    }
  });

  it("rejects fixture patient-detail patterns with reason and message", () => {
    const cases: Array<{ text: string; reason: string }> = [
      { text: "Contact user@example.com for updates", reason: "email" },
      { text: "Call 416-555-0100 tomorrow", reason: "phone" },
      { text: "Call +44 20 7946 0958 for follow-up", reason: "phone" },
      { text: "Card 1234-567-890 on file", reason: "health_card" },
      { text: "Card 1234 567 890 on file", reason: "health_card" },
      { text: "Born 03/15/1990", reason: "date_of_birth" },
      { text: "Born 25/12/1980", reason: "date_of_birth" },
      { text: "May 12, 1980 intake note", reason: "date_of_birth" },
      { text: "Started 12.05.1980 program", reason: "date_of_birth" },
      { text: "DOB 05/12/80 on chart", reason: "date_of_birth" },
      { text: "Review 2026-10-29 progress week 2", reason: "date_of_birth" },
      { text: "Since 12 May 1980 flare-ups", reason: "date_of_birth" },
    ];
    for (const { text, reason } of cases) {
      const result = validateFreeTextForPatientDetails(text);
      expect(result.ok, text).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(reason);
        expect(result.message).toBe(PATIENT_DETAIL_REJECTION_MESSAGE);
      }
    }
  });
});

describe("get_program_share_link_or_pdf contract", () => {
  it("never accepts publish or overrides on the input schema", () => {
    const props = getProgramShareLinkOrPdfInputSchema.properties as Record<
      string,
      unknown
    >;
    expect(props.publish).toBeUndefined();
    expect(props.overrides).toBeUndefined();
  });

  it("classifies draft only, published only, and published with draft changes", () => {
    const published = { version: 2, updated_at: "2026-10-24T14:10:00Z" };
    expect(
      inferGetProgramDisplayState(
        { version: 1, updated_at: "2026-10-23T10:00:00Z" },
        null,
      ),
    ).toBe("draft_only");
    expect(inferGetProgramDisplayState(null, published)).toBe("published_only");
    expect(
      inferGetProgramDisplayState(
        { version: 3, updated_at: "2026-10-25T09:00:00Z" },
        published,
      ),
    ).toBe("published_with_draft_changes");
  });

  it("returns link fields only when a published version exists on read path", () => {
    expect(publishedLinkFieldsPresent(null)).toBe(false);
    expect(
      publishedLinkFieldsPresent({ version: 1, updated_at: "2026-10-23T10:00:00Z" }),
    ).toBe(true);
  });
});

describe("contract regression guards (mutant killers)", () => {
  it("exports locked tool name constants matching registry order", () => {
    expect(SEARCH_APPROVED_EXERCISES_TOOL_NAME).toBe(LOCKED_TOOL_NAMES[0]);
    expect(SEARCH_ROUTINES_TOOL_NAME).toBe(LOCKED_TOOL_NAMES[1]);
    expect(GET_PROGRAM_BUILDER_LINK_TOOL_NAME).toBe(LOCKED_TOOL_NAMES[2]);
    expect(GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME).toBe(LOCKED_TOOL_NAMES[3]);
  });

  it("rejects patient-like property names in isolation", () => {
    for (const name of ["client_name", "phone_number", "client_dob", "name"]) {
      expect(isPatientInfoPropertyName(name)).toBe(true);
    }
  });

  it("requires summary and share_link on search output schema", () => {
    const required = PHYSIO_MCP_TOOLS[0].outputSchema.required as string[];
    expect(required).toContain("summary");
    expect(required).toContain("share_link");
  });

  it("requires builder_link on get_program_builder_link output schema", () => {
    const required = PHYSIO_MCP_TOOLS[2].outputSchema.required as string[];
    expect(required).toContain("builder_link");
  });
});
