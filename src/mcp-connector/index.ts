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
  GET_PROGRAM_NEVER_AUTO_PUBLISH,
  GET_PROGRAM_REPUBLISH_KEEPS_SHARE_LINK,
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

export {
  WEB_APP_EXERCISE_SEARCH_PATH,
  WEB_APP_EXERCISE_SEARCH_QUERY_PARAM,
  buildWebAppExerciseSearchUrl,
  normalizeWebAppBaseUrl,
} from "./urls.js";

export {
  ambiguousProgramMatchSchema,
  approvedExerciseSummarySchema,
  exerciseCategorySchema,
  exerciseNotFoundSchema,
  nullableProgramVersionRefSchema,
  prescriptionTypeSchema,
  programCodeProperty,
  programRowInputSchema,
  programRowOutputSchema,
  programTitleProperty,
  programVersionRefSchema,
  publishOverridesInputSchema,
  rowParamsSchema,
  routineSummarySchema,
  searchLinkOutputProperty,
  shareLinkOutputProperty,
  summaryOutputProperty,
  toolResponseBaseSchema,
} from "./json-schema.js";
