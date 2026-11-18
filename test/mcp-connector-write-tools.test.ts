import { describe, expect, it } from "vitest";
import {
  CREATE_OR_EDIT_PROGRAM_TOOL_NAME,
  DELETE_PROGRAM_TOOL_NAME,
  PHYSIO_MCP_TOOLS,
  PUBLISH_PROGRAM_TOOL_NAME,
  SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
} from "../src/mcp-connector/index.js";

function toolDescription(name: string): string {
  return PHYSIO_MCP_TOOLS.find((t) => t.name === name)!.description;
}

/** Literal pins from spec.md Tools (v13) APPROVED #25–#27 on main @ 5c02d0b (DIDI-1251). */
const PUBLISH_PROGRAM_DESCRIPTION_APPROVED_25 =
  "Publish a program, or publish its draft changes to the same share link. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, link state and expiry. The question must cover the program name, that it creates or updates the share link, that anyone with the link sees this version, and the expiry and whether it is the default. For a program made from a routine, also say that later routine edits won't change it. For changes to a live program, say what changed and that the patient sees it on the same link. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.";

const SET_PROGRAM_LINK_EXPIRY_DESCRIPTION_APPROVED_26 =
  "Change when a program's share link expires. The link stays the same. If the user's message already names the date or expiry, call this tool directly. Otherwise, ask the user in the conversation and wait for an explicit yes before calling. Read the program first with get_program_share_link_or_pdf. The question must cover the program name, the new expiry, that it's the same link, and the current expiry. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.";

const DELETE_PROGRAM_DESCRIPTION_APPROVED_27 =
  "Delete a program. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, exercise count and link state. The question must cover the program name, code and exercise count, that it moves to Recently deleted, that its share link closes (only when the link is open), and that it can be restored in the web app for 30 days. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.";

describe("Physio MCP write tool descriptions (DIDI-1242 / DIDI-1251)", () => {
  it("omits create_or_edit_program tool description pending approval", () => {
    expect(toolDescription(CREATE_OR_EDIT_PROGRAM_TOOL_NAME)).toBe("");
  });

  it("pins publish_program description as literal APPROVED #25", () => {
    expect(toolDescription(PUBLISH_PROGRAM_TOOL_NAME)).toBe(
      PUBLISH_PROGRAM_DESCRIPTION_APPROVED_25,
    );
  });

  it("pins set_program_link_expiry description as literal APPROVED #26", () => {
    expect(toolDescription(SET_PROGRAM_LINK_EXPIRY_TOOL_NAME)).toBe(
      SET_PROGRAM_LINK_EXPIRY_DESCRIPTION_APPROVED_26,
    );
  });

  it("pins delete_program description as literal APPROVED #27", () => {
    expect(toolDescription(DELETE_PROGRAM_TOOL_NAME)).toBe(
      DELETE_PROGRAM_DESCRIPTION_APPROVED_27,
    );
  });

  it("requires every tool to carry all three MCP annotation keys", () => {
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
