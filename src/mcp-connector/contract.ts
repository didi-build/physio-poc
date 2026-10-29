import type { JsonSchema } from "./json-schema.js";
import {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  buildOrEditProgramDescription,
  buildOrEditProgramInputSchema,
  buildOrEditProgramOutputSchema,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  getProgramShareLinkOrPdfDescription,
  getProgramShareLinkOrPdfInputSchema,
  getProgramShareLinkOrPdfOutputSchema,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  searchApprovedExercisesDescription,
  searchApprovedExercisesInputSchema,
  searchApprovedExercisesOutputSchema,
  searchRoutinesDescription,
  searchRoutinesInputSchema,
  searchRoutinesOutputSchema,
} from "./tools.js";

export type PhysioMcpToolName =
  | typeof SEARCH_APPROVED_EXERCISES_TOOL_NAME
  | typeof SEARCH_ROUTINES_TOOL_NAME
  | typeof BUILD_OR_EDIT_PROGRAM_TOOL_NAME
  | typeof GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME;

export type PhysioMcpToolDefinition = {
  readonly name: PhysioMcpToolName;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
};

export const PHYSIO_MCP_TOOLS: readonly PhysioMcpToolDefinition[] = [
  {
    name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
    description: searchApprovedExercisesDescription,
    inputSchema: searchApprovedExercisesInputSchema,
    outputSchema: searchApprovedExercisesOutputSchema,
  },
  {
    name: SEARCH_ROUTINES_TOOL_NAME,
    description: searchRoutinesDescription,
    inputSchema: searchRoutinesInputSchema,
    outputSchema: searchRoutinesOutputSchema,
  },
  {
    name: BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
    description: buildOrEditProgramDescription,
    inputSchema: buildOrEditProgramInputSchema,
    outputSchema: buildOrEditProgramOutputSchema,
  },
  {
    name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
    description: getProgramShareLinkOrPdfDescription,
    inputSchema: getProgramShareLinkOrPdfInputSchema,
    outputSchema: getProgramShareLinkOrPdfOutputSchema,
  },
] as const;

export const PHYSIO_MCP_TOOL_NAMES: readonly PhysioMcpToolName[] = PHYSIO_MCP_TOOLS.map(
  (tool) => tool.name,
);

export function getPhysioMcpTool(
  name: PhysioMcpToolName,
): PhysioMcpToolDefinition | undefined {
  return PHYSIO_MCP_TOOLS.find((tool) => tool.name === name);
}

export {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
} from "./tools.js";
