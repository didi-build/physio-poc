import type { JsonSchema } from "./json-schema.js";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MCP_TOOL_ANNOTATIONS,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  getProgramBuilderLinkDescription,
  getProgramBuilderLinkInputSchema,
  getProgramBuilderLinkOutputSchema,
  getProgramShareLinkOrPdfDescription,
  getProgramShareLinkOrPdfInputSchema,
  getProgramShareLinkOrPdfOutputSchema,
  searchApprovedExercisesDescription,
  searchApprovedExercisesInputSchema,
  searchApprovedExercisesOutputSchema,
  searchRoutinesDescription,
  searchRoutinesInputSchema,
  searchRoutinesOutputSchema,
  type PhysioMcpToolAnnotations,
} from "./tools.js";

export type PhysioMcpToolName =
  | typeof SEARCH_APPROVED_EXERCISES_TOOL_NAME
  | typeof SEARCH_ROUTINES_TOOL_NAME
  | typeof GET_PROGRAM_BUILDER_LINK_TOOL_NAME
  | typeof GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME;

export type PhysioMcpToolDefinition = {
  readonly name: PhysioMcpToolName;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  readonly annotations: PhysioMcpToolAnnotations;
};

export const PHYSIO_MCP_TOOLS: readonly PhysioMcpToolDefinition[] = [
  {
    name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
    description: searchApprovedExercisesDescription,
    inputSchema: searchApprovedExercisesInputSchema,
    outputSchema: searchApprovedExercisesOutputSchema,
    annotations: MCP_TOOL_ANNOTATIONS,
  },
  {
    name: SEARCH_ROUTINES_TOOL_NAME,
    description: searchRoutinesDescription,
    inputSchema: searchRoutinesInputSchema,
    outputSchema: searchRoutinesOutputSchema,
    annotations: MCP_TOOL_ANNOTATIONS,
  },
  {
    name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
    description: getProgramBuilderLinkDescription,
    inputSchema: getProgramBuilderLinkInputSchema,
    outputSchema: getProgramBuilderLinkOutputSchema,
    annotations: MCP_TOOL_ANNOTATIONS,
  },
  {
    name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
    description: getProgramShareLinkOrPdfDescription,
    inputSchema: getProgramShareLinkOrPdfInputSchema,
    outputSchema: getProgramShareLinkOrPdfOutputSchema,
    annotations: MCP_TOOL_ANNOTATIONS,
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
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MCP_TOOL_ANNOTATIONS,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  type PhysioMcpToolAnnotations,
} from "./tools.js";
