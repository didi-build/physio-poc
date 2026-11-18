import { describe, expect, it } from "vitest";
import { PHYSIO_MCP_TOOLS } from "../src/mcp-connector/index.js";
import {
  exerciseNotFoundSchema,
  publishOverridesInputSchema,
  shareLinkExpiresInInputProperty,
} from "../src/mcp-connector/json-schema.js";
import { SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM } from "../src/mcp-connector/share-link-expiry.js";
import {
  findSchemaAtPath,
  visitSchemaNodes,
} from "./mcp-connector-schema-test-utils.js";

function writeTool(name: string) {
  return PHYSIO_MCP_TOOLS.find((t) => t.name === name)!;
}

describe("Physio MCP write tool schemas (DIDI-1242)", () => {
  it("pins share link expiry enum on set_program_link_expiry and publish overrides", () => {
    expect(shareLinkExpiresInInputProperty.enum).toEqual([
      ...SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM,
    ]);
    expect(
      (publishOverridesInputSchema.properties as Record<string, unknown>).expires_in,
    ).toMatchObject({ enum: [...SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM] });
  });

  it("pins exercises_not_found candidate_matches maxItems 3", () => {
    expect(exerciseNotFoundSchema.properties).toBeDefined();
    const candidates = (
      exerciseNotFoundSchema.properties as Record<string, { maxItems?: number }>
    ).candidate_matches;
    expect(candidates?.maxItems).toBe(3);
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
    visitSchemaNodes(tool.inputSchema, (node) => {
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

  it("omits description on fields pending Designer copy", () => {
    const fieldsWithoutDescription: Array<{ tool: string; path: string }> = [
      { tool: "create_or_edit_program", path: "rows" },
      { tool: "create_or_edit_program", path: "from_routine_id" },
      { tool: "publish_program", path: "overrides.expires_in" },
      { tool: "publish_program", path: "overrides.custom_date" },
      { tool: "set_program_link_expiry", path: "expires_in" },
      { tool: "set_program_link_expiry", path: "custom_date" },
      {
        tool: "create_or_edit_program",
        path: "exercises_not_found.items.requested_exercise_name",
      },
      {
        tool: "create_or_edit_program",
        path: "exercises_not_found.items.candidate_matches",
      },
      {
        tool: "create_or_edit_program",
        path: "exercises_not_found.items.web_app_exercise_search_url",
      },
      { tool: "publish_program", path: "publish_change_lines" },
      { tool: "delete_program", path: "restore_until" },
    ];
    for (const { tool, path } of fieldsWithoutDescription) {
      const schema = writeTool(tool);
      const segments = path.split(".");
      const node =
        segments[0] === "exercises_not_found"
          ? findSchemaAtPath(schema.outputSchema, segments)
          : path.startsWith("overrides")
            ? findSchemaAtPath(
                schema.inputSchema,
                path === "overrides.expires_in"
                  ? ["overrides", "properties", "expires_in"]
                  : ["overrides", "properties", "custom_date"],
              )
            : path === "publish_change_lines"
              ? findSchemaAtPath(schema.outputSchema, ["publish_change_lines"])
              : path === "restore_until"
                ? findSchemaAtPath(schema.outputSchema, ["restore_until"])
                : findSchemaAtPath(schema.inputSchema, [segments[0]!]);
      expect(node?.description, `${tool} ${path}`).toBeUndefined();
    }
  });
});
