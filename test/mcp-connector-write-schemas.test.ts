import { describe, expect, it } from "vitest";
import { PHYSIO_MCP_TOOLS } from "../src/mcp-connector/index.js";
import {
  exerciseNotFoundCandidateSchema,
  exerciseNotFoundSchema,
  publishOverridesInputSchema,
  shareLinkExpiresInInputProperty,
} from "../src/mcp-connector/json-schema.js";
import {
  findSchemaAtPath,
  visitSchemaNodesWithPath,
} from "./mcp-connector-schema-test-utils.js";

const SHARE_LINK_EXPIRES_IN_LITERALS = [
  "1_week",
  "30_days",
  "90_days",
  "1_year",
  "never",
  "custom_date",
] as const;

function writeTool(name: string) {
  return PHYSIO_MCP_TOOLS.find((t) => t.name === name)!;
}

function expectNoDescription(node: unknown, label: string): void {
  expect(node, `${label} missing`).toBeTruthy();
  expect((node as { description?: string }).description, label).toBeUndefined();
}

describe("Physio MCP write tool schemas (DIDI-1242)", () => {
  it("pins share link expiry enum as literals on set and publish overrides", () => {
    expect(shareLinkExpiresInInputProperty.enum).toEqual([
      ...SHARE_LINK_EXPIRES_IN_LITERALS,
    ]);
    const overridesExpiresIn = (
      publishOverridesInputSchema.properties as Record<string, unknown>
    ).expires_in;
    expect(overridesExpiresIn).toMatchObject({
      enum: [...SHARE_LINK_EXPIRES_IN_LITERALS],
    });
  });

  it("pins exercises_not_found candidate_matches maxItems 3", () => {
    const candidates = (
      exerciseNotFoundSchema.properties as Record<string, { maxItems?: number }>
    ).candidate_matches;
    expect(candidates?.maxItems).toBe(3);
  });

  it("omits description on create_or_edit program_title input", () => {
    const tool = writeTool("create_or_edit_program");
    expectNoDescription(
      findSchemaAtPath(tool.inputSchema, ["program_title"]),
      "create_or_edit_program.input.program_title",
    );
  });

  it("pins create_or_edit input from_routine_id and output source_routine_id shapes", () => {
    const tool = writeTool("create_or_edit_program");
    expect(findSchemaAtPath(tool.inputSchema, ["from_routine_id"])).toMatchObject({
      type: "string",
    });
    expect(findSchemaAtPath(tool.outputSchema, ["source_routine_id"])).toMatchObject({
      type: "string",
    });
  });

  it("pins program row exercise_name input maxLength 100", () => {
    const tool = writeTool("create_or_edit_program");
    let maxLength: number | undefined;
    visitSchemaNodesWithPath(tool.inputSchema, [], (node) => {
      const props = node.properties as
        Record<string, { maxLength?: number }> | undefined;
      if (props?.exercise_name?.maxLength !== undefined) {
        maxLength = props.exercise_name.maxLength;
      }
    });
    expect(maxLength).toBe(100);
  });

  it("pins required output fields on write tools", () => {
    expect(writeTool("create_or_edit_program").outputSchema.required).toEqual(
      expect.arrayContaining([
        "summary",
        "share_link",
        "manage_url",
        "program_code",
        "program_title",
        "rows",
      ]),
    );
    expect(writeTool("publish_program").outputSchema.required).toEqual(
      expect.arrayContaining([
        "summary",
        "share_link",
        "manage_url",
        "pdf_url",
        "draft_state",
        "published",
        "publish_change_lines",
      ]),
    );
    expect(writeTool("delete_program").outputSchema.required).toEqual(
      expect.arrayContaining([
        "summary",
        "share_link",
        "manage_url",
        "program_code",
        "restore_until",
      ]),
    );
  });

  it("publish overrides.expires_in and custom_date exist and omit description", () => {
    expectNoDescription(
      (publishOverridesInputSchema.properties as Record<string, unknown>).expires_in,
      "publishOverridesInputSchema.expires_in",
    );
    expectNoDescription(
      (publishOverridesInputSchema.properties as Record<string, unknown>).custom_date,
      "publishOverridesInputSchema.custom_date",
    );
    const toolOverrides = (
      writeTool("publish_program").inputSchema.properties as Record<
        string,
        JsonSchemaLike
      >
    ).overrides;
    expect(toolOverrides).toBeDefined();
    const nested = toolOverrides!.properties as Record<string, unknown>;
    expectNoDescription(
      nested.expires_in,
      "publish_program.input.overrides.expires_in",
    );
    expectNoDescription(
      nested.custom_date,
      "publish_program.input.overrides.custom_date",
    );
  });

  it("omits description on agreed write-only schema fields", () => {
    const create = writeTool("create_or_edit_program");
    expectNoDescription(findSchemaAtPath(create.inputSchema, ["rows"]), "rows");
    expectNoDescription(
      findSchemaAtPath(create.inputSchema, ["from_routine_id"]),
      "from_routine_id",
    );
    expectNoDescription(
      findSchemaAtPath(create.outputSchema, ["exercises_not_found"]),
      "exercises_not_found",
    );
    expectNoDescription(
      (exerciseNotFoundSchema.properties as Record<string, unknown>)
        .requested_exercise_name,
      "requested_exercise_name",
    );
    expectNoDescription(
      (exerciseNotFoundSchema.properties as Record<string, unknown>).candidate_matches,
      "candidate_matches",
    );
    expectNoDescription(
      (exerciseNotFoundSchema.properties as Record<string, unknown>)
        .web_app_exercise_search_url,
      "web_app_exercise_search_url",
    );
    expectNoDescription(
      (exerciseNotFoundCandidateSchema.properties as Record<string, unknown>)
        .exercise_version_id,
      "candidate exercise_version_id",
    );
    expectNoDescription(
      (exerciseNotFoundCandidateSchema.properties as Record<string, unknown>)
        .exercise_name,
      "candidate exercise_name",
    );

    const publish = writeTool("publish_program");
    expectNoDescription(
      findSchemaAtPath(publish.outputSchema, ["publish_change_lines"]),
      "publish_change_lines",
    );

    const expiry = writeTool("set_program_link_expiry");
    expectNoDescription(
      findSchemaAtPath(expiry.inputSchema, ["expires_in"]),
      "expires_in",
    );
    expectNoDescription(
      findSchemaAtPath(expiry.inputSchema, ["custom_date"]),
      "custom_date",
    );

    const del = writeTool("delete_program");
    expectNoDescription(
      findSchemaAtPath(del.outputSchema, ["restore_until"]),
      "restore_until",
    );

    visitSchemaNodesWithPath(create.inputSchema, [], (node, path) => {
      const props = node.properties as Record<string, unknown> | undefined;
      if (!props) return;
      for (const key of [
        "exercise_version_id",
        "prescription_type",
        "params",
        "row_notes",
      ]) {
        if (props[key] !== undefined) {
          const label = `${path.join(".")}.${key}`;
          expectNoDescription(props[key], `create row ${label}`);
        }
      }
      if (props.reps !== undefined || props.min !== undefined) {
        expectNoDescription(node, `create row params leaf ${path.join(".")}`);
      }
    });
  });
});

type JsonSchemaLike = {
  readonly [key: string]: unknown;
  properties?: Record<string, JsonSchemaLike>;
};
