export type { JsonSchema } from "./json-schema.js";
export {
  CONNECTOR_PHYSIO_APP_ROUTE_NAMES,
  EXERCISE_SEARCH_QUERY_PARAM,
  FROM_ROUTINE_ID_QUERY_PARAM,
  MAX_EXERCISE_SEARCH_QUERY_LENGTH,
  PHYSIO_APP_ROUTE_PATTERNS,
  buildPhysioAppUrl,
  buildProgramBuilderLink,
  buildWebAppExerciseSearchUrl,
  fillPhysioAppRoutePattern,
  normalizeWebAppBaseUrl,
  type ConnectorPhysioAppRouteName,
  type FillPhysioAppRouteParams,
  type PhysioAppRouteName,
} from "../app-routes.js";

export {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  MCP_TOOL_ANNOTATIONS,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  getPhysioMcpTool,
  PHYSIO_MCP_TOOL_NAMES,
  PHYSIO_MCP_TOOLS,
  type PhysioMcpToolDefinition,
  type PhysioMcpToolName,
  type PhysioMcpToolAnnotations,
} from "./contract.js";

export {
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

export {
  inferGetProgramDisplayState,
  publishedLinkFieldsPresent,
  type GetProgramDisplayState,
  type ProgramVersionRef,
} from "./get-program-contract.js";

export {
  PATIENT_DETAIL_REJECTION_MESSAGE,
  validateFreeTextForPatientDetails,
  type PatientDetailRejectionReason,
  type PatientDetailValidationResult,
} from "./patient-detail-validator.js";

export {
  SHARE_LINK_EXPIRES_IN,
  SHARE_LINK_EXPIRES_IN_SCHEMA_ENUM,
  type ShareLinkExpiresIn,
} from "./share-link-expiry.js";

export {
  FREE_TEXT_NO_PATIENT_DETAILS,
  MAX_LENGTH_PROGRAM_TITLE,
  MAX_LENGTH_QUERY,
  MAX_LENGTH_REQUESTED_EXERCISE_NAME,
  MAX_LENGTH_ROUTINE_NAME,
  MAX_LENGTH_ROW_NOTES,
  MAX_LENGTH_SUMMARY,
} from "./text-limits.js";

/** @deprecated Use PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch */
export const WEB_APP_EXERCISE_SEARCH_PATH = "/exercises/search";

/** @deprecated Use EXERCISE_SEARCH_QUERY_PARAM */
export const WEB_APP_EXERCISE_SEARCH_QUERY_PARAM = "q";

export {
  ambiguousProgramMatchSchema,
  approvedExerciseSummarySchema,
  exerciseCategorySchema,
  nullableProgramVersionRefSchema,
  prescriptionTypeSchema,
  programCodeProperty,
  programTitleProperty,
  programVersionRefSchema,
  publishOverridesInputSchema,
  rowParamsSchema,
  routineSummarySchema,
  searchLinkOutputProperty,
  shareLinkOutputProperty,
  summaryOutputProperty,
} from "./json-schema.js";
