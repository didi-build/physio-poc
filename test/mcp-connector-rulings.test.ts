import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FREE_TEXT_NO_PATIENT_DETAILS,
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MAX_LENGTH_PROGRAM_TITLE,
  MAX_LENGTH_QUERY,
  MAX_LENGTH_ROUTINE_NAME,
  MAX_LENGTH_ROW_NOTES,
  MCP_TOOL_ANNOTATIONS,
  PHYSIO_MCP_TOOLS,
  SEARCH_ROUTINES_TOOL_NAME,
  getProgramBuilderLinkInputSchema,
  getProgramShareLinkOrPdfInputSchema,
  searchApprovedExercisesInputSchema,
  searchApprovedExercisesOutputSchema,
  searchRoutinesInputSchema,
} from "../src/mcp-connector/index.js";
import { programRowInputSchema } from "../src/mcp-connector/json-schema.js";
import {
  collectSchemaDescriptionViolations,
  findSchemaAtPath,
  visitSchemaNodes,
} from "./mcp-connector-schema-test-utils.js";

const GOLDEN_PATH = join(process.cwd(), "test/fixtures/physio-mcp-tools.golden.json");

function schemaRequired(schema: { required?: unknown }): string[] {
  return Array.isArray(schema.required) ? [...schema.required] : [];
}

describe("CTO ruling pins (golden snapshot and explicit assertions)", () => {
  it("matches committed golden snapshot of PHYSIO_MCP_TOOLS", () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    expect(PHYSIO_MCP_TOOLS).toEqual(golden);
  });

  it("pins MCP tool annotations on every tool", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(tool.annotations).toEqual(MCP_TOOL_ANNOTATIONS);
    }
  });

  it("pins free-text maxLength caps at 80/80/300/100 where applicable", () => {
    expect(
      (searchApprovedExercisesInputSchema.properties as Record<string, unknown>).query,
    ).toMatchObject({ maxLength: MAX_LENGTH_QUERY });
    expect(MAX_LENGTH_QUERY).toBe(100);

    expect(
      findSchemaAtPath(getProgramShareLinkOrPdfInputSchema, ["program_title"]),
    ).toMatchObject({
      maxLength: MAX_LENGTH_PROGRAM_TITLE,
    });
    expect(MAX_LENGTH_PROGRAM_TITLE).toBe(80);

    const routinesTool = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === SEARCH_ROUTINES_TOOL_NAME,
    )!;
    visitSchemaNodes(routinesTool.outputSchema, (node) => {
      const props = node.properties as
        Record<string, { maxLength?: number }> | undefined;
      if (props?.routine_name?.maxLength !== undefined) {
        expect(props.routine_name.maxLength).toBe(MAX_LENGTH_ROUTINE_NAME);
      }
    });
    expect(MAX_LENGTH_ROUTINE_NAME).toBe(80);

    visitSchemaNodes(programRowInputSchema, (node) => {
      const props = node.properties as
        Record<string, { maxLength?: number }> | undefined;
      if (props?.row_notes?.maxLength !== undefined) {
        expect(props.row_notes.maxLength).toBe(MAX_LENGTH_ROW_NOTES);
      }
    });
    expect(MAX_LENGTH_ROW_NOTES).toBe(300);
  });

  it("pins literal required arrays on tool output schemas", () => {
    expect(schemaRequired(searchApprovedExercisesOutputSchema).sort()).toEqual(
      ["exercises", "manage_url", "share_link", "summary"].sort(),
    );
    const searchRoutines = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === SEARCH_ROUTINES_TOOL_NAME,
    )!;
    expect(schemaRequired(searchRoutines.outputSchema).sort()).toEqual(
      ["manage_url", "routines", "share_link", "summary"].sort(),
    );
    const builder = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
    )!;
    expect(schemaRequired(builder.outputSchema).sort()).toEqual(
      ["builder_link", "share_link", "summary"].sort(),
    );
    const getProgram = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
    )!;
    expect(schemaRequired(getProgram.outputSchema).sort()).toEqual(
      [
        "draft",
        "manage_link",
        "manage_url",
        "pdf_url",
        "publish_link",
        "published",
        "share_link",
        "summary",
      ].sort(),
    );
  });

  it("pins pagination limit default 10 and maximum 25 on search inputs", () => {
    for (const schema of [
      searchApprovedExercisesInputSchema,
      searchRoutinesInputSchema,
    ]) {
      const limit = (schema.properties as Record<string, JsonSchemaLike>).limit;
      expect(limit).toMatchObject({ minimum: 1, maximum: 25, default: 10 });
    }
  });

  it("pins get_program_builder_link optional program_code and from_routine_id only", () => {
    const props = getProgramBuilderLinkInputSchema.properties as Record<
      string,
      JsonSchemaLike
    >;
    expect(Object.keys(props).sort()).toEqual(["from_routine_id", "program_code"]);
    expect(schemaRequired(getProgramBuilderLinkInputSchema)).toEqual([]);
  });

  it("pins prescription type and category enums on search tools", () => {
    const category = (
      searchApprovedExercisesInputSchema.properties as Record<string, JsonSchemaLike>
    ).category;
    expect(category?.enum).toEqual(["Stretching", "Strengthening"]);
  });

  it("requires FREE_TEXT_NO_PATIENT_DETAILS on every capped free-text field description", () => {
    const paths: Array<{ root: JsonSchemaLike; path: string[] }> = [
      { root: searchApprovedExercisesInputSchema, path: ["query"] },
      { root: searchRoutinesInputSchema, path: ["query"] },
      { root: getProgramShareLinkOrPdfInputSchema, path: ["program_title"] },
    ];
    for (const { root, path } of paths) {
      const field = findSchemaAtPath(root, path);
      expect(String(field?.description)).toContain(FREE_TEXT_NO_PATIENT_DETAILS);
    }
    const routinesTool = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === SEARCH_ROUTINES_TOOL_NAME,
    )!;
    visitSchemaNodes(routinesTool.outputSchema, (node) => {
      const props = node.properties as Record<string, JsonSchemaLike> | undefined;
      if (props?.routine_name?.maxLength !== undefined) {
        expect(String(props.routine_name.description)).toContain(
          FREE_TEXT_NO_PATIENT_DETAILS,
        );
      }
    });
  });

  it("has no patient-like names in tool or field descriptions", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(
        collectSchemaDescriptionViolations(tool.inputSchema),
        `${tool.name} input descriptions`,
      ).toEqual([]);
      expect(
        collectSchemaDescriptionViolations(tool.outputSchema),
        `${tool.name} output descriptions`,
      ).toEqual([]);
      expect(
        collectSchemaDescriptionViolations({ description: tool.description }),
        `${tool.name} tool description`,
      ).toEqual([]);
    }
  });
});

type JsonSchemaLike = {
  readonly [key: string]: unknown;
  properties?: Record<string, JsonSchemaLike>;
  oneOf?: JsonSchemaLike[];
  items?: JsonSchemaLike;
  required?: string[];
};
