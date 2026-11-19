import { describe, expect, it } from "vitest";
import {
  CREATE_OR_EDIT_PROGRAM_TOOL_NAME,
  PHYSIO_MCP_TOOLS,
} from "../src/mcp-connector/index.js";
import {
  DELETE_PROGRAM_TOOL_NAME,
  PUBLISH_PROGRAM_TOOL_NAME,
  SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
} from "../src/mcp-connector/write-tools.js";

const WRITE_TOOL_NAMES = new Set([
  CREATE_OR_EDIT_PROGRAM_TOOL_NAME,
  PUBLISH_PROGRAM_TOOL_NAME,
  SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
  DELETE_PROGRAM_TOOL_NAME,
]);

/** Literal pins (spec @ 5c02d0b / DIDI-1251); do not import contract exports. */
const PATIENT_INFORMATION_SENTENCE = "Do not pass patient information.";

const TOOL_DESCRIPTION_LITERALS: Record<string, string> = {
  [PUBLISH_PROGRAM_TOOL_NAME]:
    "Publish a program, or publish its draft changes to the same share link. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, link state and expiry. The question must cover the program name, that it creates or updates the share link, that anyone with the link sees this version, and the expiry and whether it is the default. For a program made from a routine, also say that later routine edits won't change it. For changes to a live program, say what changed and that the patient sees it on the same link. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.",
  [SET_PROGRAM_LINK_EXPIRY_TOOL_NAME]:
    "Change when a program's share link expires. The link stays the same. If the user's message already names the date or expiry, call this tool directly. Otherwise, ask the user in the conversation and wait for an explicit yes before calling. Read the program first with get_program_share_link_or_pdf. The question must cover the program name, the new expiry, that it's the same link, and the current expiry. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.",
  [DELETE_PROGRAM_TOOL_NAME]:
    "Delete a program. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, exercise count and link state. The question must cover the program name, code and exercise count, that it moves to Recently deleted, that its share link closes (only when the link is open), and that it can be restored in the web app for 30 days. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.",
};

type DescLocation = { tool: string; side: string; path: string; description: string };

function collectDescriptions(
  node: unknown,
  path: string,
  tool: string,
  side: string,
  out: DescLocation[],
): void {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  if (typeof n.description === "string") {
    out.push({ tool, side, path: path || "(root)", description: n.description });
  }
  if (n.properties && typeof n.properties === "object") {
    for (const [k, v] of Object.entries(n.properties as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k;
      collectDescriptions(v, p, tool, side, out);
    }
  }
  if (n.items) collectDescriptions(n.items, `${path}[]`, tool, side, out);
  if (Array.isArray(n.oneOf))
    for (const b of n.oneOf) collectDescriptions(b, path, tool, side, out);
  if (Array.isArray(n.allOf))
    for (const b of n.allOf) collectDescriptions(b, path, tool, side, out);
}

function isAllowedFreeTextInputPath(path: string): boolean {
  if (path === "program_title") return true;
  if (path === "rows[].row_notes" || path.endsWith(".row_notes")) return true;
  if (path === "rows[].exercise_name" || path.endsWith(".exercise_name")) {
    return path.includes("rows");
  }
  return false;
}

describe("Write tool schemas carry only approved descriptions (spec 5c02d0b)", () => {
  it("allows only #25–#27 tool text, empty create tool text, or patient line on free-text inputs", () => {
    const locations: DescLocation[] = [];

    for (const tool of PHYSIO_MCP_TOOLS) {
      if (!(WRITE_TOOL_NAMES as Set<string>).has(tool.name)) continue;

      if (tool.name === CREATE_OR_EDIT_PROGRAM_TOOL_NAME) {
        expect(tool.description).toBe("");
      } else {
        expect(tool.description).toBe(TOOL_DESCRIPTION_LITERALS[tool.name]);
      }

      collectDescriptions(tool.inputSchema, "", tool.name, "input", locations);
      collectDescriptions(tool.outputSchema, "", tool.name, "output", locations);
    }

    expect(
      locations.length,
      "every write schema description enumerated",
    ).toBeGreaterThan(0);

    for (const loc of locations) {
      if (loc.side === "input" && isAllowedFreeTextInputPath(loc.path)) {
        expect(loc.description, `${loc.tool} ${loc.side} ${loc.path}`).toBe(
          PATIENT_INFORMATION_SENTENCE,
        );
        continue;
      }
      expect(
        false,
        `Unexpected description on ${loc.tool} ${loc.side} ${loc.path}: ${loc.description.slice(0, 120)}`,
      ).toBe(true);
    }
  });
});
