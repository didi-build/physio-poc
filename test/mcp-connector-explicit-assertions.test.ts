import { describe, expect, it } from "vitest";
import {
  MAX_LENGTH_QUERY,
  MAX_LENGTH_ROUTINE_NAME,
  MAX_LENGTH_SUMMARY,
  PHYSIO_MCP_TOOLS,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  searchApprovedExercisesInputSchema,
  searchApprovedExercisesOutputSchema,
  searchLinkOutputProperty,
  searchRoutinesInputSchema,
  summaryOutputProperty,
} from "../src/mcp-connector/index.js";
import {
  collectForbiddenLegacySchemaFields,
  collectPatientLikeDescriptionViolations,
  collectSchemaDescriptionViolations,
  collectSchemaPropertyNames,
  findSchemaAtPath,
  visitSchemaNodes,
} from "./mcp-connector-schema-test-utils.js";

describe("DIDI-1026 explicit MCP contract assertions", () => {
  it("bans patternProperties on every tool input and output schema", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      for (const [side, schema] of [
        ["input", tool.inputSchema],
        ["output", tool.outputSchema],
      ] as const) {
        visitSchemaNodes(schema, (node) => {
          if (node.patternProperties) {
            throw new Error(`${tool.name} ${side}: patternProperties is not allowed`);
          }
        });
      }
    }
  });

  it("has no legacy date or publish override fields anywhere in tool schemas", () => {
    for (const tool of PHYSIO_MCP_TOOLS) {
      for (const [side, schema] of [
        ["input", tool.inputSchema],
        ["output", tool.outputSchema],
      ] as const) {
        expect(
          collectForbiddenLegacySchemaFields(schema),
          `${tool.name} ${side}`,
        ).toEqual([]);
      }
    }
  });

  it("pins query maxLength on both search tool inputs", () => {
    for (const schema of [
      searchApprovedExercisesInputSchema,
      searchRoutinesInputSchema,
    ]) {
      expect(findSchemaAtPath(schema, ["query"])).toMatchObject({
        maxLength: MAX_LENGTH_QUERY,
      });
    }
    expect(MAX_LENGTH_QUERY).toBe(100);
  });

  it("pins routine_name maxLength on search_routines output items", () => {
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

  it("pins summary maxLength at 4000 on tool output summaries", () => {
    expect(summaryOutputProperty.maxLength).toBe(MAX_LENGTH_SUMMARY);
    expect(MAX_LENGTH_SUMMARY).toBe(4000);
    for (const tool of PHYSIO_MCP_TOOLS) {
      visitSchemaNodes(tool.outputSchema, (node) => {
        const props = node.properties as
          Record<string, { maxLength?: number; type?: string }> | undefined;
        if (
          props?.summary?.type === "string" &&
          props.summary.maxLength !== undefined
        ) {
          expect(props.summary.maxLength, `${tool.name} summary`).toBe(4000);
        }
      });
    }
  });

  it("keeps search_link only on search_approved_exercises and pins uri format", () => {
    expect(searchLinkOutputProperty).toMatchObject({ format: "uri" });

    const owners: string[] = [];
    for (const tool of PHYSIO_MCP_TOOLS) {
      const outputProps = collectSchemaPropertyNames(tool.outputSchema);
      if (outputProps.has("search_link")) {
        owners.push(tool.name);
      }
    }
    expect(owners).toEqual([SEARCH_APPROVED_EXERCISES_TOOL_NAME]);

    const routines = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === SEARCH_ROUTINES_TOOL_NAME,
    )!;
    expect(collectSchemaPropertyNames(routines.outputSchema).has("search_link")).toBe(
      false,
    );
    expect(
      findSchemaAtPath(searchApprovedExercisesOutputSchema, ["search_link"]),
    ).toMatchObject({ format: "uri" });
  });

  it("flags patient-like names in descriptions but accepts ordinary exercise names", () => {
    expect(
      collectPatientLikeDescriptionViolations("Contact Maria Lopez for care"),
    ).toEqual(
      expect.arrayContaining(["fixture-patient-name", "capitalized-pair:Maria Lopez"]),
    );
    expect(collectPatientLikeDescriptionViolations("Schedule for Jane Doe")).toEqual(
      expect.arrayContaining(["fixture-patient-name", "for-person-phrase"]),
    );
    expect(
      collectPatientLikeDescriptionViolations("Stable code (for example PRG-7K3Q)."),
    ).toEqual([]);

    for (const exerciseName of ["Glute Bridge", "Heel Slides", "Romanian Deadlift"]) {
      expect(collectPatientLikeDescriptionViolations(exerciseName)).toEqual([]);
    }

    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(
        collectSchemaDescriptionViolations(tool.inputSchema),
        `${tool.name} input`,
      ).toEqual([]);
      expect(
        collectSchemaDescriptionViolations(tool.outputSchema),
        `${tool.name} output`,
      ).toEqual([]);
      expect(
        collectPatientLikeDescriptionViolations(tool.description),
        `${tool.name} tool description`,
      ).toEqual([]);
    }
  });
});
