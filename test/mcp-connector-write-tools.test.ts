import { describe, expect, it } from "vitest";
import {
  DELETE_PROGRAM_TOOL_NAME,
  PHYSIO_MCP_TOOLS,
  PUBLISH_PROGRAM_TOOL_NAME,
  SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
} from "../src/mcp-connector/index.js";

describe("Physio MCP write tool descriptions (DIDI-1242)", () => {
  it("pins explicit confirmation wording on publish, expiry, and delete", () => {
    const publish = PHYSIO_MCP_TOOLS.find((t) => t.name === PUBLISH_PROGRAM_TOOL_NAME)!;
    const expiry = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
    )!;
    const remove = PHYSIO_MCP_TOOLS.find((t) => t.name === DELETE_PROGRAM_TOOL_NAME)!;

    expect(publish.description).toContain(
      "Call only after the user explicitly confirms in the conversation",
    );
    expect(expiry.description).toContain(
      "get explicit confirmation in the conversation first",
    );
    expect(remove.description).toContain(
      "Call only after the user explicitly confirms in the conversation",
    );
  });

  it("requires every tool to carry all three MCP annotations", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(tool.annotations, `${tool.name} readOnlyHint`).toHaveProperty(
        "readOnlyHint",
      );
      expect(tool.annotations, `${tool.name} destructiveHint`).toHaveProperty(
        "destructiveHint",
      );
      expect(tool.annotations, `${tool.name} openWorldHint`).toHaveProperty(
        "openWorldHint",
      );
    }
  });
});
