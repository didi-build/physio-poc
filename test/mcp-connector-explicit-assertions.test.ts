import { describe, expect, it } from "vitest";
import type { JsonSchema } from "../src/mcp-connector/index.js";
import {
  MAX_LENGTH_QUERY,
  MAX_LENGTH_REQUESTED_EXERCISE_NAME,
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
import { programRowInputSchema } from "../src/mcp-connector/json-schema.js";
import {
  collectForbiddenLegacySchemaFields,
  collectPatientLikeDescriptionViolations,
  collectSchemaDescriptionViolations,
  collectSchemaPropertyNames,
  findSchemaAtPath,
  visitSchemaNodes,
} from "./mcp-connector-schema-test-utils.js";

describe("collectForbiddenLegacySchemaFields", () => {
  it("detects legacy publish and date fields at top level, nested, and under allOf/then", () => {
    const topLevel: JsonSchema = {
      type: "object",
      properties: {
        expires_in: { type: "string" },
      },
    };
    expect(collectForbiddenLegacySchemaFields(topLevel)).toEqual([
      "property:expires_in",
    ]);

    const nested: JsonSchema = {
      type: "object",
      properties: {
        wrapper: {
          type: "object",
          properties: {
            custom_date: { type: "string", format: "date" },
          },
        },
      },
    };
    expect(collectForbiddenLegacySchemaFields(nested).sort()).toEqual(
      ["format:date", "property:custom_date"].sort(),
    );

    const conditional: JsonSchema = {
      allOf: [
        {
          if: { properties: { publish: { const: true } } },
          then: {
            type: "object",
            properties: {
              exercises_not_found: { type: "array", items: { type: "string" } },
            },
          },
        },
      ],
    };
    expect(collectForbiddenLegacySchemaFields(conditional)).toEqual([
      "property:exercises_not_found",
    ]);
  });
});

describe("DIDI-1026 explicit MCP contract assertions", () => {
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

  it("requires routine_name maxLength on search_routines routine items", () => {
    const routinesTool = PHYSIO_MCP_TOOLS.find(
      (t) => t.name === SEARCH_ROUTINES_TOOL_NAME,
    )!;
    expect(
      findSchemaAtPath(routinesTool.outputSchema, [
        "routines",
        "items",
        "routine_name",
      ]),
    ).toMatchObject({ maxLength: MAX_LENGTH_ROUTINE_NAME });
    expect(MAX_LENGTH_ROUTINE_NAME).toBe(80);
  });

  it("requires summary maxLength 4000 on every tool output schema", () => {
    expect(summaryOutputProperty).toMatchObject({ maxLength: MAX_LENGTH_SUMMARY });
    expect(MAX_LENGTH_SUMMARY).toBe(4000);
    for (const tool of PHYSIO_MCP_TOOLS) {
      expect(
        findSchemaAtPath(tool.outputSchema, ["summary"]),
        `${tool.name} summary`,
      ).toMatchObject({
        type: "string",
        maxLength: MAX_LENGTH_SUMMARY,
      });
    }
  });

  it("pins programRowInputSchema exercise_name maxLength at 100", () => {
    let sawExerciseName = false;
    visitSchemaNodes(programRowInputSchema, (node) => {
      const props = node.properties as
        Record<string, { maxLength?: number }> | undefined;
      if (props?.exercise_name !== undefined) {
        sawExerciseName = true;
        expect(props.exercise_name.maxLength).toBe(MAX_LENGTH_REQUESTED_EXERCISE_NAME);
      }
    });
    expect(sawExerciseName).toBe(true);
    expect(MAX_LENGTH_REQUESTED_EXERCISE_NAME).toBe(100);
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

  it("flags patient-like names in descriptions", () => {
    expect(
      collectPatientLikeDescriptionViolations("Contact Maria Lopez for care"),
    ).toEqual(
      expect.arrayContaining(["fixture-patient-name", "capitalized-pair:Maria Lopez"]),
    );
    expect(collectPatientLikeDescriptionViolations("Schedule for Jane Doe")).toEqual(
      expect.arrayContaining(["fixture-patient-name", "capitalized-pair:Jane Doe"]),
    );
    expect(
      collectPatientLikeDescriptionViolations("Stable code (for example PRG-7K3Q)."),
    ).toEqual([]);
    expect(
      collectPatientLikeDescriptionViolations("Glute bridge and heel slides"),
    ).toEqual([]);

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
