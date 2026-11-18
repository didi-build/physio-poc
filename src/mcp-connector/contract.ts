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
} from "./tools.js";
import type { PhysioMcpToolAnnotations } from "./tools.js";
import {
  CREATE_OR_EDIT_PROGRAM_TOOL_NAME,
  DELETE_PROGRAM_TOOL_NAME,
  MCP_CREATE_EDIT_PROGRAM_ANNOTATIONS,
  MCP_DESTRUCTIVE_WRITE_TOOL_ANNOTATIONS,
  PUBLISH_PROGRAM_TOOL_NAME,
  SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
  createOrEditProgramDescription,
  createOrEditProgramInputSchema,
  createOrEditProgramOutputSchema,
  deleteProgramDescription,
  deleteProgramInputSchema,
  deleteProgramOutputSchema,
  publishProgramDescription,
  publishProgramInputSchema,
  publishProgramOutputSchema,
  setProgramLinkExpiryDescription,
  setProgramLinkExpiryInputSchema,
  setProgramLinkExpiryOutputSchema,
} from "./write-tools.js";

export type PhysioMcpToolName =
  | typeof SEARCH_APPROVED_EXERCISES_TOOL_NAME
  | typeof SEARCH_ROUTINES_TOOL_NAME
  | typeof GET_PROGRAM_BUILDER_LINK_TOOL_NAME
  | typeof GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME
  | typeof CREATE_OR_EDIT_PROGRAM_TOOL_NAME
  | typeof PUBLISH_PROGRAM_TOOL_NAME
  | typeof SET_PROGRAM_LINK_EXPIRY_TOOL_NAME
  | typeof DELETE_PROGRAM_TOOL_NAME;

export type PhysioMcpToolDefinition = {
  readonly name: PhysioMcpToolName;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly outputSchema: JsonSchema;
  readonly annotations: PhysioMcpToolAnnotations;
};

export type { PhysioMcpToolAnnotations };

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
  {
    name: CREATE_OR_EDIT_PROGRAM_TOOL_NAME,
    description: createOrEditProgramDescription,
    inputSchema: createOrEditProgramInputSchema,
    outputSchema: createOrEditProgramOutputSchema,
    annotations: MCP_CREATE_EDIT_PROGRAM_ANNOTATIONS,
  },
  {
    name: PUBLISH_PROGRAM_TOOL_NAME,
    description: publishProgramDescription,
    inputSchema: publishProgramInputSchema,
    outputSchema: publishProgramOutputSchema,
    annotations: MCP_DESTRUCTIVE_WRITE_TOOL_ANNOTATIONS,
  },
  {
    name: SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
    description: setProgramLinkExpiryDescription,
    inputSchema: setProgramLinkExpiryInputSchema,
    outputSchema: setProgramLinkExpiryOutputSchema,
    annotations: MCP_DESTRUCTIVE_WRITE_TOOL_ANNOTATIONS,
  },
  {
    name: DELETE_PROGRAM_TOOL_NAME,
    description: deleteProgramDescription,
    inputSchema: deleteProgramInputSchema,
    outputSchema: deleteProgramOutputSchema,
    annotations: MCP_DESTRUCTIVE_WRITE_TOOL_ANNOTATIONS,
  },
] as const;

/** Tools the live MCP server lists and accepts (DIDI-1244–1247 wire these later). */
export const PHYSIO_MCP_WIRED_TOOL_NAMES = [
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
] as const;

export type PhysioMcpWiredToolName = (typeof PHYSIO_MCP_WIRED_TOOL_NAMES)[number];

export const PHYSIO_MCP_WIRED_TOOLS: readonly PhysioMcpToolDefinition[] =
  PHYSIO_MCP_TOOLS.filter((tool) =>
    (PHYSIO_MCP_WIRED_TOOL_NAMES as readonly string[]).includes(tool.name),
  );

export const PHYSIO_MCP_TOOL_NAMES: readonly PhysioMcpWiredToolName[] = [
  ...PHYSIO_MCP_WIRED_TOOL_NAMES,
];

export function getPhysioMcpTool(
  name: PhysioMcpToolName,
): PhysioMcpToolDefinition | undefined {
  return PHYSIO_MCP_TOOLS.find((tool) => tool.name === name);
}

export {
  CREATE_OR_EDIT_PROGRAM_TOOL_NAME,
  DELETE_PROGRAM_TOOL_NAME,
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MCP_CREATE_EDIT_PROGRAM_ANNOTATIONS,
  MCP_DESTRUCTIVE_WRITE_TOOL_ANNOTATIONS,
  MCP_TOOL_ANNOTATIONS,
  PUBLISH_PROGRAM_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  SET_PROGRAM_LINK_EXPIRY_TOOL_NAME,
};
