import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  buildWebAppExerciseSearchUrl,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  PHYSIO_MCP_TOOLS,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  type JsonSchema,
} from "../src/mcp-connector/index.js";

const MCP_CONNECTOR_DIR = join(process.cwd(), "src/mcp-connector");

/** Property names allowed anywhere in each tool's input or output schema (update when schemas change). */
const ALLOWED_SCHEMA_PROPERTY_NAMES: Record<
  string,
  { input: readonly string[]; output: readonly string[] }
> = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: {
    input: ["query", "category", "body_region", "prescription_type"],
    output: [
      "summary",
      "share_link",
      "exercises",
      "exercise_version_id",
      "exercise_name",
      "category",
      "body_regions",
      "allowed_prescription_types",
    ],
  },
  [SEARCH_ROUTINES_TOOL_NAME]: {
    input: ["query"],
    output: [
      "summary",
      "share_link",
      "routines",
      "routine_id",
      "routine_name",
      "routine_version",
      "exercise_count",
      "source",
    ],
  },
  [BUILD_OR_EDIT_PROGRAM_TOOL_NAME]: {
    input: [
      "web_app_base_url",
      "program_code",
      "program_title",
      "source_routine_id",
      "rows",
      "exercise_version_id",
      "prescription_type",
      "params",
      "row_notes",
      "reps",
      "sets",
      "hold_s",
      "ascent_s",
      "descent_s",
      "rest_s",
      "per_day",
      "days_per_week",
      "min",
      "max",
    ],
    output: [
      "summary",
      "share_link",
      "program_code",
      "program_title",
      "source_routine_id",
      "rows",
      "exercises_not_found",
      "exercise_version_id",
      "prescription_type",
      "params",
      "row_notes",
      "reps",
      "sets",
      "hold_s",
      "ascent_s",
      "descent_s",
      "rest_s",
      "per_day",
      "days_per_week",
      "min",
      "max",
      "requested_exercise_name",
      "web_app_exercise_search_url",
    ],
  },
  [GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME]: {
    input: ["program_code", "program_title", "deliverable"],
    output: [
      "summary",
      "share_link",
      "pdf_url",
      "program_code",
      "program_title",
      "link_expires_at",
    ],
  },
};

const PATIENT_INFO_PROPERTY_PATTERNS: readonly RegExp[] = [
  /patient/i,
  /^first_name$/i,
  /^last_name$/i,
  /^full_name$/i,
  /^given_name$/i,
  /^family_name$/i,
  /^email$/i,
  /^phone$/i,
  /^mobile$/i,
  /^address/i,
  /\bdob\b/i,
  /date_of_birth/i,
  /birth_date/i,
  /^diagnosis$/i,
  /^condition$/i,
  /\bmrn\b/i,
  /health_card/i,
  /^gender$/i,
  /^sex$/i,
  /^age$/i,
  /^contact_/i,
];

function isPatientInfoPropertyName(name: string): boolean {
  return PATIENT_INFO_PROPERTY_PATTERNS.some((pattern) => pattern.test(name));
}

function collectPropertyNames(schema: JsonSchema, into: Set<string>): void {
  if (!schema || typeof schema !== "object") return;

  const props = schema.properties;
  if (props && typeof props === "object") {
    for (const key of Object.keys(props as Record<string, unknown>)) {
      into.add(key);
      collectPropertyNames((props as Record<string, JsonSchema>)[key], into);
    }
  }

  const items = schema.items;
  if (items) {
    if (Array.isArray(items)) {
      for (const item of items) collectPropertyNames(item, into);
    } else {
      collectPropertyNames(items as JsonSchema, into);
    }
  }

  for (const combiner of ["oneOf", "anyOf", "allOf"] as const) {
    const branch = schema[combiner];
    if (Array.isArray(branch)) {
      for (const sub of branch) collectPropertyNames(sub as JsonSchema, into);
    }
  }
}

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listTsFiles(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

describe("Physio MCP connector contract", () => {
  it("defines exactly the four locked tools", () => {
    expect(PHYSIO_MCP_TOOLS).toHaveLength(4);
    expect(PHYSIO_MCP_TOOLS.map((t) => t.name)).toEqual([
      SEARCH_APPROVED_EXERCISES_TOOL_NAME,
      SEARCH_ROUTINES_TOOL_NAME,
      BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
      GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
    ]);
  });

  it("uses object schemas with additionalProperties false at the root of each tool schema branch", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      for (const [label, schema] of [
        ["input", tool.inputSchema],
        ["output", tool.outputSchema],
      ] as const) {
        const roots = flattenObjectRoots(schema);
        expect(
          roots.length,
          `${tool.name} ${label} should declare at least one object root`,
        ).toBeGreaterThan(0);
        for (const root of roots) {
          expect(
            root.additionalProperties,
            `${tool.name} ${label} object must set additionalProperties: false`,
          ).toBe(false);
        }
      }
    }
  });

  it("pins allowed property names per tool and rejects patient-info-like names", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      const allowed = ALLOWED_SCHEMA_PROPERTY_NAMES[tool.name];
      expect(allowed, `missing allow list for ${tool.name}`).toBeDefined();

      for (const [side, schema] of [
        ["input", tool.inputSchema],
        ["output", tool.outputSchema],
      ] as const) {
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

  it("has no platform-specific imports in src/mcp-connector", () => {
    const forbiddenImport =
      /^\s*import\s+.+\s+from\s+["'](node:|cloudflare|@cloudflare\/|wrangler)/;
    for (const file of listTsFiles(MCP_CONNECTOR_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        expect(forbiddenImport.test(line), `platform import in ${file}: ${line}`).toBe(
          false,
        );
      }
    }
  });

  it("buildWebAppExerciseSearchUrl uses configurable base and query param", () => {
    const url = buildWebAppExerciseSearchUrl(
      "https://app.example.com/",
      "Glute bridge",
    );
    expect(url).toBe("https://app.example.com/exercises/search?q=Glute+bridge");
  });
});

function flattenObjectRoots(schema: JsonSchema): JsonSchema[] {
  const roots: JsonSchema[] = [];
  if (schema.type === "object") roots.push(schema);
  for (const combiner of ["oneOf", "anyOf", "allOf"] as const) {
    const branch = schema[combiner];
    if (Array.isArray(branch)) {
      for (const sub of branch) roots.push(...flattenObjectRoots(sub as JsonSchema));
    }
  }
  const items = schema.items;
  if (items && !Array.isArray(items)) {
    roots.push(...flattenObjectRoots(items as JsonSchema));
  }
  return roots;
}
