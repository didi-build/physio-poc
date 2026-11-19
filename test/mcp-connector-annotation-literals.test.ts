import { describe, expect, it } from "vitest";
import { PHYSIO_MCP_TOOLS } from "../src/mcp-connector/index.js";

const READ_ONLY_WIRED_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const CREATE_EDIT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const DESTRUCTIVE_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

const ANNOTATIONS_BY_TOOL: Record<
  string,
  {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  }
> = {
  search_approved_exercises: READ_ONLY_WIRED_ANNOTATIONS,
  search_routines: READ_ONLY_WIRED_ANNOTATIONS,
  get_program_builder_link: READ_ONLY_WIRED_ANNOTATIONS,
  get_program_share_link_or_pdf: READ_ONLY_WIRED_ANNOTATIONS,
  create_or_edit_program: CREATE_EDIT_ANNOTATIONS,
  publish_program: DESTRUCTIVE_WRITE_ANNOTATIONS,
  set_program_link_expiry: DESTRUCTIVE_WRITE_ANNOTATIONS,
  delete_program: DESTRUCTIVE_WRITE_ANNOTATIONS,
};

describe("Physio MCP tool annotation literals (DIDI-1242)", () => {
  it("pins readOnlyHint, destructiveHint, and openWorldHint without importing contract constants", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(tool.annotations, tool.name).toEqual(ANNOTATIONS_BY_TOOL[tool.name]);
    }
  });
});
