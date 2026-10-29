import { readFileSync } from "node:fs";
import { join } from "node:path";
import AjvModule from "ajv";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
} from "../src/mcp-connector/index.js";
import {
  build_or_edit_program,
  get_program_share_link_or_pdf,
  search_approved_exercises,
  search_routines,
} from "../src/services/mcp/generated/input-validators.js";

const goldenTools = JSON.parse(
  readFileSync(
    join(process.cwd(), "test/fixtures/physio-mcp-tools.golden.json"),
    "utf8",
  ),
) as { name: string; inputSchema: Record<string, unknown> }[];

const Ajv = AjvModule.default ?? AjvModule;
const addFormats = addFormatsModule.default ?? addFormatsModule;

const ajv = new Ajv({
  strict: false,
  validateFormats: true,
  validateSchema: false,
  allErrors: true,
});
addFormats(ajv);

const runtimeValidators: Record<string, ReturnType<typeof ajv.compile>> = {};
for (const tool of goldenTools) {
  runtimeValidators[tool.name] = ajv.compile(tool.inputSchema);
}

const generatedValidators = {
  [SEARCH_APPROVED_EXERCISES_TOOL_NAME]: search_approved_exercises,
  [SEARCH_ROUTINES_TOOL_NAME]: search_routines,
  [BUILD_OR_EDIT_PROGRAM_TOOL_NAME]: build_or_edit_program,
  [GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME]: get_program_share_link_or_pdf,
} as const;

function expectAgreement(toolName: string, data: unknown) {
  const runtimeOk = runtimeValidators[toolName](data);
  const generatedOk =
    generatedValidators[toolName as keyof typeof generatedValidators](data);
  expect(generatedOk).toBe(runtimeOk);
}

const emoji = "😀";
const ninetyNineLetters = "a".repeat(99);
const astralQuery = `${ninetyNineLetters}${emoji}`;

const invalidDates = [
  "2027-13-01",
  "2027-00-10",
  "2027-99-99",
  "2027-04-31",
  "2027-02-29",
];

describe("generated MCP validators vs runtime Ajv", () => {
  it("agrees on valid and invalid samples for every tool", () => {
    const cases: { tool: string; data: unknown }[] = [
      { tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME, data: { query: "calf stretch" } },
      { tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME, data: { query: astralQuery } },
      { tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME, data: { query: "x".repeat(101) } },
      { tool: SEARCH_APPROVED_EXERCISES_TOOL_NAME, data: { query: "" } },
      { tool: SEARCH_ROUTINES_TOOL_NAME, data: { query: "knee" } },
      { tool: SEARCH_ROUTINES_TOOL_NAME, data: { query: astralQuery } },
      {
        tool: BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
        data: {
          program_title: `${ninetyNineLetters}${emoji}`,
          rows: [
            {
              exercise_name: `${ninetyNineLetters}${emoji}`,
              prescription_type: "stretching",
              params: { sets: 1 },
            },
          ],
        },
      },
      {
        tool: BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
        data: {
          program_title: "Plan",
          rows: [
            {
              exercise_name: "Heel slides",
              prescription_type: "stretching",
              params: { sets: 1 },
              row_notes: `${ninetyNineLetters}${emoji}`,
            },
          ],
        },
      },
      {
        tool: BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
        data: {
          program_title: "x".repeat(81),
          rows: [
            {
              exercise_name: "Heel slides",
              prescription_type: "stretching",
              params: { sets: 1 },
            },
          ],
        },
      },
      {
        tool: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        data: { program_code: "PRG-STUB01" },
      },
      {
        tool: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        data: {
          program_code: "PRG-STUB01",
          publish: true,
          overrides: { expires_in: "custom_date", custom_date: "2027-06-15" },
        },
      },
      ...invalidDates.map((custom_date) => ({
        tool: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
        data: {
          program_code: "PRG-STUB01",
          publish: true,
          overrides: { expires_in: "custom_date", custom_date },
        },
      })),
    ];

    for (const { tool, data } of cases) {
      expectAgreement(tool, data);
    }
  });
});
