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

/** Literal pin (DIDI-594 comment 5d59df38 / spec 463); do not import schema constants. */
const PATIENT_INFORMATION_SENTENCE = "Do not pass patient information.";

function expectExactInputDescription(node: unknown, label: string): void {
  expect(node, `${label} missing`).toBeTruthy();
  expect((node as { description?: string }).description, label).toBe(
    PATIENT_INFORMATION_SENTENCE,
  );
}

function expectNoDescription(node: unknown, label: string): void {
  expect(node, `${label} missing`).toBeTruthy();
  expect(
    Object.prototype.hasOwnProperty.call(node as object, "description"),
    label,
  ).toBe(false);
}

describe("Write free-text field descriptions (CTO 343fc67a)", () => {
  it("pins exact patient-information sentence on every free-text write input", () => {
    expectExactInputDescription(
      findSchemaAtPath(
        PHYSIO_MCP_TOOLS.find((t) => t.name === "create_or_edit_program")!.inputSchema,
        ["program_title"],
      ),
      "create_or_edit_program.input.program_title",
    );

    visitSchemaNodes(programRowInputSchema, (node) => {
      const props = node.properties as
        Record<string, { description?: string }> | undefined;
      if (props?.row_notes) {
        expectExactInputDescription(props.row_notes, "programRowInput row_notes");
      }
      if (props?.exercise_name?.description !== undefined) {
        expectExactInputDescription(
          props.exercise_name,
          "programRowInput exercise_name",
        );
      }
    });
  });

  it("omits description on listed write output free-text fields", () => {
    visitSchemaNodes(programRowOutputSchema, (node) => {
      const props = node.properties as Record<string, unknown> | undefined;
      if (props?.row_notes) {
        expectNoDescription(props.row_notes, "programRowOutput row_notes");
      }
      if (props?.exercise_name) {
        expectNoDescription(props.exercise_name, "programRowOutput exercise_name");
      }
    });

    expectNoDescription(
      (exerciseNotFoundSchema.properties as Record<string, unknown>)
        .requested_exercise_name,
      "exercises_not_found.requested_exercise_name",
    );
    expectNoDescription(
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
        expectNoDescription(title, `${tool.name}.output.program_title`);
      }
    }
  });
});
