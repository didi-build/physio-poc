import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  FREE_TEXT_NO_PATIENT_DETAILS,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MAX_LENGTH_PROGRAM_TITLE,
  MAX_LENGTH_QUERY,
  MAX_LENGTH_REQUESTED_EXERCISE_NAME,
  MAX_LENGTH_ROUTINE_NAME,
  MAX_LENGTH_ROW_NOTES,
  PHYSIO_MCP_TOOLS,
  SEARCH_ROUTINES_TOOL_NAME,
  SHARE_LINK_EXPIRES_IN,
  SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM,
  buildOrEditProgramInputSchema,
  getProgramShareLinkOrPdfInputSchema,
  programRowInputSchema,
  publishOverridesInputSchema,
  searchApprovedExercisesInputSchema,
  searchApprovedExercisesOutputSchema,
  searchRoutinesInputSchema,
} from "../src/mcp-connector/index.js";
import {
  findSchemaAtPath,
  visitSchemaNodes,
} from "./mcp-connector-schema-test-utils.js";

const GOLDEN_PATH = join(process.cwd(), "test/fixtures/physio-mcp-tools.golden.json");

const PATIENT_NAME_IN_DESCRIPTION =
  /\b(?:Jane|John)\s+(?:Doe|Smith)\b|\bpatient\s+name\s*:/i;

function schemaRequired(schema: { required?: unknown }): string[] {
  return Array.isArray(schema.required) ? [...schema.required] : [];
}

describe("CTO ruling pins (golden snapshot and explicit assertions)", () => {
  it("matches committed golden snapshot of PHYSIO_MCP_TOOLS", () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    expect(PHYSIO_MCP_TOOLS).toEqual(golden);
  });

  it("pins free-text maxLength caps at 80/80/300/100/100", () => {
    expect(
      (searchApprovedExercisesInputSchema.properties as Record<string, unknown>).query,
    ).toMatchObject({ maxLength: MAX_LENGTH_QUERY });
    expect(MAX_LENGTH_QUERY).toBe(100);

    expect(
      findSchemaAtPath(buildOrEditProgramInputSchema, ["program_title"]),
    ).toMatchObject({
      maxLength: MAX_LENGTH_PROGRAM_TITLE,
    });
    expect(MAX_LENGTH_PROGRAM_TITLE).toBe(80);

    const rowOneOf = programRowInputSchema.oneOf as Array<JsonSchemaLike>;
    const notesBranch = rowOneOf[0]?.properties as Record<
      string,
      { maxLength?: number }
    >;
    expect(notesBranch?.row_notes?.maxLength).toBe(MAX_LENGTH_ROW_NOTES);
    expect(MAX_LENGTH_ROW_NOTES).toBe(300);

    const nameBranch = rowOneOf.find(
      (branch) =>
        branch.properties &&
        "exercise_name" in (branch.properties as Record<string, unknown>),
    );
    expect(
      (nameBranch?.properties as Record<string, { maxLength?: number }>).exercise_name
        .maxLength,
    ).toBe(MAX_LENGTH_REQUESTED_EXERCISE_NAME);
    expect(MAX_LENGTH_REQUESTED_EXERCISE_NAME).toBe(100);

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
  });

  it("pins the six share-link expiry enum values including never and custom_date", () => {
    expect(SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM).toEqual([
      SHARE_LINK_EXPIRES_IN.one_week,
      SHARE_LINK_EXPIRES_IN.thirty_days,
      SHARE_LINK_EXPIRES_IN.ninety_days,
      SHARE_LINK_EXPIRES_IN.one_year,
      SHARE_LINK_EXPIRES_IN.never,
      SHARE_LINK_EXPIRES_IN.custom_date,
    ]);
    expect(publishOverridesInputSchema.properties).toHaveProperty("custom_date");
  });

  it("pins publish as boolean defaulting to false on get_program input", () => {
    const publish = (
      getProgramShareLinkOrPdfInputSchema.properties as Record<
        string,
        { type?: string; default?: boolean }
      >
    ).publish;
    expect(publish?.type).toBe("boolean");
    expect(publish?.default).toBe(false);
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
    const build = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
    )!;
    expect(schemaRequired(build.outputSchema).sort()).toEqual(
      [
        "manage_url",
        "program_code",
        "program_title",
        "rows",
        "share_link",
        "summary",
      ].sort(),
    );
    const getProgram = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
    )!;
    expect(schemaRequired(getProgram.outputSchema).sort()).toEqual(
      ["draft", "manage_url", "pdf_url", "published", "share_link", "summary"].sort(),
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

  it("pins candidate_matches maxItems at 3 on exercises_not_found", () => {
    const build = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
    )!;
    const notFoundItem = (
      build.outputSchema.properties as Record<string, JsonSchemaLike>
    ).exercises_not_found?.items as JsonSchemaLike;
    expect(
      (notFoundItem?.properties as Record<string, JsonSchemaLike>)?.candidate_matches
        ?.maxItems,
    ).toBe(3);
  });

  it("pins program row input oneOf with exercise_version_id and exercise_name branches", () => {
    expect(programRowInputSchema.oneOf).toHaveLength(2);
    const branches = programRowInputSchema.oneOf as Array<JsonSchemaLike>;
    const requiredSets = branches.map((b) => [...(b.required as string[])].sort());
    expect(requiredSets).toContainEqual(
      ["exercise_name", "params", "prescription_type"].sort(),
    );
    expect(requiredSets).toContainEqual(
      ["exercise_version_id", "params", "prescription_type"].sort(),
    );
  });

  it("pins build input rows as array and prescription type and category enums", () => {
    const rows = (
      buildOrEditProgramInputSchema.properties as Record<string, JsonSchemaLike>
    ).rows;
    expect(rows?.type).toBe("array");

    const category = (
      searchApprovedExercisesInputSchema.properties as Record<string, JsonSchemaLike>
    ).category;
    expect(category?.enum).toEqual(["Stretching", "Strengthening"]);

    const branches = programRowInputSchema.oneOf as Array<JsonSchemaLike>;
    const prescription = branches[0]?.properties as Record<string, JsonSchemaLike>;
    expect(prescription?.prescription_type?.enum).toEqual([
      "stretching",
      "isometric",
      "concentric",
      "eccentric",
    ]);
  });

  it("requires FREE_TEXT_NO_PATIENT_DETAILS on every capped free-text field description", () => {
    const paths: Array<{ root: JsonSchemaLike; path: string[] }> = [
      { root: searchApprovedExercisesInputSchema, path: ["query"] },
      { root: searchRoutinesInputSchema, path: ["query"] },
      { root: buildOrEditProgramInputSchema, path: ["program_title"] },
    ];
    for (const { root, path } of paths) {
      const field = findSchemaAtPath(root, path);
      expect(String(field?.description)).toContain(FREE_TEXT_NO_PATIENT_DETAILS);
    }
    const rowOneOf = programRowInputSchema.oneOf as Array<JsonSchemaLike>;
    for (const branch of rowOneOf) {
      const props = branch.properties as Record<string, JsonSchemaLike>;
      expect(String(props.row_notes?.description)).toContain(
        FREE_TEXT_NO_PATIENT_DETAILS,
      );
      if (props.exercise_name) {
        expect(String(props.exercise_name.description)).toContain(
          FREE_TEXT_NO_PATIENT_DETAILS,
        );
      }
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

  it("has no example patient names in tool descriptions", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(
        PATIENT_NAME_IN_DESCRIPTION.test(tool.description),
        `${tool.name} description`,
      ).toBe(false);
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
