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

describe("Physio MCP write tool descriptions (DIDI-1242)", () => {
  it("pins v13 create_or_edit partial-result copy", () => {
    const d = toolDescription(CREATE_OR_EDIT_PROGRAM_TOOL_NAME);
    expect(d).toContain(
      "create or edit a program, create from a routine via create_or_edit_program with from_routine_id.",
    );
    expect(d).toContain(
      "{name} isn't in your exercise library yet, and I can't create new exercises from here.",
    );
    expect(d).toContain(
      "You can request it in the web app. The search is already filled in:",
    );
    expect(d).toContain(
      "Once a practitioner approves it, ask me again and I'll add it to {program}. The rest of the program is unchanged.",
    );
  });

  it("pins v13 publish confirm reference lines", () => {
    const d = toolDescription(PUBLISH_PROGRAM_TOOL_NAME);
    expect(d).toContain(
      "Before calling, read the program with get_program_share_link_or_pdf so the question has the real name, code, exercise count, link state and expiry.",
    );
    expect(d).toContain("Publish {name}?");
    expect(d).toContain("Creates the share link. Anyone with it sees this version.");
    expect(d).toContain("Expires in {expiry} ({date}), your default.");
    expect(d).toContain(
      "Reply yes to publish, or tell me a different expiry. No keeps it as a draft.",
    );
    expect(d).toContain(
      "A separate copy of {routine}, v{n}. Later routine edits won't change it.",
    );
    expect(d).toContain("Publish changes to {name}?");
    expect(d).toContain("One line per change from publish_change_lines.");
    expect(d).toContain("Your patient sees this on the same link right away.");
    expect(d).toContain("Reply yes to publish, or no to keep the changes as a draft.");
    expect(d).toContain("This isn't live yet.");
    expect(d).toContain(
      "{name} has draft changes that aren't live yet. Do you want the link to the published version, or should I publish the draft first?",
    );
    expect(d).toContain(
      "I can set any date from tomorrow, with no latest date, or make it never expire.",
    );
    expect(d).toContain("Expires in {expiry} ({date}).");
    expect(d).toContain("Never expires.");
  });

  it("pins v13 set_program_link_expiry confirm and skip-when-named rule", () => {
    const d = toolDescription(SET_PROGRAM_LINK_EXPIRY_TOOL_NAME);
    expect(d).toContain(
      "Call directly when the user's message names the date or expiry; otherwise confirm first.",
    );
    expect(d).toContain("Change the link for {name} to expire on {date}?");
    expect(d).toContain("Change the link for {name} to never expire?");
    expect(d).toContain("It's the same link. Right now it expires on {current_date}.");
    expect(d).toContain("It's the same link. Right now it never expires.");
    expect(d).toContain("Reply yes to change it, or no to leave it.");
  });

  it("pins v13 delete confirm reference lines", () => {
    const d = toolDescription(DELETE_PROGRAM_TOOL_NAME);
    expect(d).toContain("Delete {name}?");
    expect(d).toContain("{code}, {n} exercises. It moves to Recently deleted.");
    expect(d).toContain(
      'Closes its share link, so anyone who opens it sees "This link was closed".',
    );
    expect(d).toContain("You can restore it in the web app for 30 days.");
    expect(d).toContain("Reply yes to delete it, or no to keep it.");
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
