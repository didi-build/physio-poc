export type { JsonSchema } from "./json-schema.js";
export {
  BUILD_OR_EDIT_PROGRAM_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  getPhysioMcpTool,
  PHYSIO_MCP_TOOL_NAMES,
  PHYSIO_MCP_TOOLS,
  type PhysioMcpToolDefinition,
  type PhysioMcpToolName,
} from "./contract.js";

export {
  buildOrEditProgramDescription,
  buildOrEditProgramInputSchema,
  buildOrEditProgramOutputSchema,
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

export {
  approvedExerciseSummarySchema,
  exerciseCategorySchema,
  exerciseNotFoundSchema,
  prescriptionTypeSchema,
  programCodeProperty,
  programRowSchema,
  programTitleProperty,
  rowParamsSchema,
  routineSummarySchema,
  shareLinkOutputProperty,
  summaryOutputProperty,
  toolResponseBaseSchema,
  webAppBaseUrlProperty,
} from "./json-schema.js";

/**
 * Build a web app exercise search URL (contract helper for implementations).
 * Does not validate that baseUrl is HTTPS; callers should enforce config.
 */
export function buildWebAppExerciseSearchUrl(
  webAppBaseUrl: string,
  exerciseName: string,
): string {
  const base = webAppBaseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({ q: exerciseName });
  return `${base}/exercises/search?${params.toString()}`;
}
