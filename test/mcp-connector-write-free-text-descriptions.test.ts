import { describe, expect, it } from "vitest";
import { PHYSIO_MCP_TOOLS } from "../src/mcp-connector/index.js";
import {
  exerciseNotFoundCandidateSchema,
  exerciseNotFoundSchema,
  programRowInputSchema,
  programRowOutputSchema,
} from "../src/mcp-connector/json-schema.js";
import {
  findSchemaAtPath,
  visitSchemaNodes,
} from "./mcp-connector-schema-test-utils.js";

/** Literal pin (DIDI-594 comment 5d59df38); do not import schema constants. */
const PATIENT_INFORMATION_SENTENCE = "Do not pass patient information.";

function expectDescriptionEndsWith(node: unknown, label: string): void {
  expect(node, `${label} missing`).toBeTruthy();
  const description = (node as { description?: string }).description;
  expect(description, label).toBeDefined();
  expect(description!.endsWith(PATIENT_INFORMATION_SENTENCE), label).toBe(true);
}

const WRITE_FREE_TEXT_FIELDS: Array<{ label: string; node: unknown }> = [
  {
    label: "create_or_edit_program.input.program_title",
    node: findSchemaAtPath(
      PHYSIO_MCP_TOOLS.find((t) => t.name === "create_or_edit_program")!.inputSchema,
      ["program_title"],
    ),
  },
];

describe("Write free-text field descriptions (DIDI-594 5d59df38)", () => {
  it("ends every write free-text field description with the pinned sentence", () => {
    for (const { label, node } of WRITE_FREE_TEXT_FIELDS) {
      expectDescriptionEndsWith(node, label);
    }

    visitSchemaNodes(programRowInputSchema, (node) => {
      const props = node.properties as
        Record<string, { description?: string }> | undefined;
      if (props?.row_notes) {
        expectDescriptionEndsWith(props.row_notes, "programRowInput row_notes");
      }
      if (props?.exercise_name?.description !== undefined) {
        expectDescriptionEndsWith(props.exercise_name, "programRowInput exercise_name");
      }
    });

    visitSchemaNodes(programRowOutputSchema, (node) => {
      const props = node.properties as
        Record<string, { description?: string }> | undefined;
      if (props?.row_notes) {
        expectDescriptionEndsWith(props.row_notes, "programRowOutput row_notes");
      }
      if (props?.exercise_name) {
        expectDescriptionEndsWith(
          props.exercise_name,
          "programRowOutput exercise_name",
        );
      }
    });

    expectDescriptionEndsWith(
      (exerciseNotFoundSchema.properties as Record<string, unknown>)
        .requested_exercise_name,
      "exercises_not_found.requested_exercise_name",
    );
    expectDescriptionEndsWith(
      (exerciseNotFoundCandidateSchema.properties as Record<string, unknown>)
        .exercise_name,
      "exercises_not_found.candidate_matches.exercise_name",
    );

    const writeTools = PHYSIO_MCP_TOOLS.filter((t) =>
      [
        "create_or_edit_program",
        "publish_program",
        "set_program_link_expiry",
        "delete_program",
      ].includes(t.name),
    );
    for (const tool of writeTools) {
      const title = findSchemaAtPath(tool.outputSchema, ["program_title"]);
      if (title) {
        expectDescriptionEndsWith(title, `${tool.name}.output.program_title`);
      }
    }
  });
});
