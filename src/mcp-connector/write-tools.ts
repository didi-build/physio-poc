import type { JsonSchema } from "./json-schema.js";
import {
  exerciseNotFoundSchema,
  programRowInputSchema,
  programRowOutputSchema,
  publishChangeLinesOutputProperty,
  publishOverridesInputSchema,
  restoreUntilOutputProperty,
  routineIdProperty,
  shareLinkCustomDateInputProperty,
  shareLinkExpiresInInputProperty,
  writeDraftStateOutputProperty,
  writeExerciseCountOutputProperty,
  writeExpiresAtOutputProperty,
  writeManageUrlOutputProperty,
  writeNullableProgramTitleOutputProperty,
  writeNullableProgramVersionRefSchema,
  writePdfUrlOutputProperty,
  writeProgramCodeProperty,
  writeProgramTitleInputProperty,
  writeRoutineIdOutputProperty,
  writeShareLinkOutputProperty,
  writeShareLinkStateOutputProperty,
  writeSummaryOutputProperty,
} from "./json-schema.js";

export const CREATE_OR_EDIT_PROGRAM_TOOL_NAME = "create_or_edit_program" as const;

/** No approved tool description (DIDI-1251 #25–#27 cover publish/set/delete only). */
export const createOrEditProgramDescription = "";

/** spec.md Tools (v13) APPROVED #25 (DIDI-1251 / spec PR132). */
export const publishProgramDescription =
  "Publish a program, or publish its draft changes to the same share link. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, link state and expiry. The question must cover the program name, that it creates or updates the share link, that anyone with the link sees this version, and the expiry and whether it is the default. For a program made from a routine, also say that later routine edits won't change it. For changes to a live program, say what changed and that the patient sees it on the same link. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.";

const routineIdWithoutDescription: JsonSchema = { ...routineIdProperty };
delete (routineIdWithoutDescription as { description?: string }).description;

export const createOrEditProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: writeProgramCodeProperty,
    program_title: writeProgramTitleInputProperty,
    from_routine_id: routineIdWithoutDescription,
    rows: {
      type: "array",
      items: programRowInputSchema,
    },
  },
};

export const createOrEditProgramOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "share_link",
    "manage_url",
    "program_code",
    "program_title",
    "rows",
  ],
  properties: {
    summary: writeSummaryOutputProperty,
    share_link: writeShareLinkOutputProperty,
    manage_url: writeManageUrlOutputProperty,
    program_code: writeProgramCodeProperty,
    program_title: writeNullableProgramTitleOutputProperty,
    source_routine_id: writeRoutineIdOutputProperty,
    exercise_count: writeExerciseCountOutputProperty,
    rows: {
      type: "array",
      items: programRowOutputSchema,
    },
    exercises_not_found: {
      type: "array",
      items: exerciseNotFoundSchema,
    },
  },
};

export const PUBLISH_PROGRAM_TOOL_NAME = "publish_program" as const;

export const publishProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code"],
  properties: {
    program_code: writeProgramCodeProperty,
    overrides: publishOverridesInputSchema,
  },
};

export const publishProgramOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "share_link",
    "manage_url",
    "pdf_url",
    "draft_state",
    "published",
    "publish_change_lines",
  ],
  properties: {
    summary: writeSummaryOutputProperty,
    share_link: writeShareLinkOutputProperty,
    pdf_url: writePdfUrlOutputProperty,
    manage_url: writeManageUrlOutputProperty,
    expires_at: writeExpiresAtOutputProperty,
    program_code: writeProgramCodeProperty,
    program_title: writeNullableProgramTitleOutputProperty,
    draft_state: writeDraftStateOutputProperty,
    draft: writeNullableProgramVersionRefSchema,
    published: writeNullableProgramVersionRefSchema,
    share_link_state: writeShareLinkStateOutputProperty,
    publish_change_lines: publishChangeLinesOutputProperty,
  },
};

export const SET_PROGRAM_LINK_EXPIRY_TOOL_NAME = "set_program_link_expiry" as const;

/** spec.md Tools (v13) APPROVED #26 (DIDI-1251 / spec PR132). */
export const setProgramLinkExpiryDescription =
  "Change when a program's share link expires. The link stays the same. If the user's message already names the date or expiry, call this tool directly. Otherwise, ask the user in the conversation and wait for an explicit yes before calling. Read the program first with get_program_share_link_or_pdf. The question must cover the program name, the new expiry, that it's the same link, and the current expiry. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.";

export const setProgramLinkExpiryInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code", "expires_in"],
  properties: {
    program_code: writeProgramCodeProperty,
    expires_in: shareLinkExpiresInInputProperty,
    custom_date: shareLinkCustomDateInputProperty,
  },
};

export const setProgramLinkExpiryOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "manage_url", "program_code"],
  properties: {
    summary: writeSummaryOutputProperty,
    share_link: writeShareLinkOutputProperty,
    manage_url: writeManageUrlOutputProperty,
    expires_at: writeExpiresAtOutputProperty,
    program_code: writeProgramCodeProperty,
    program_title: writeNullableProgramTitleOutputProperty,
    share_link_state: writeShareLinkStateOutputProperty,
  },
};

export const DELETE_PROGRAM_TOOL_NAME = "delete_program" as const;

/** spec.md Tools (v13) APPROVED #27 (DIDI-1251 / spec PR132). */
export const deleteProgramDescription =
  "Delete a program. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, exercise count and link state. The question must cover the program name, code and exercise count, that it moves to Recently deleted, that its share link closes (only when the link is open), and that it can be restored in the web app for 30 days. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information.";

export const deleteProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code"],
  properties: {
    program_code: writeProgramCodeProperty,
  },
};

export const deleteProgramOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "manage_url", "program_code", "restore_until"],
  properties: {
    summary: writeSummaryOutputProperty,
    share_link: writeShareLinkOutputProperty,
    manage_url: writeManageUrlOutputProperty,
    program_code: writeProgramCodeProperty,
    program_title: writeNullableProgramTitleOutputProperty,
    restore_until: restoreUntilOutputProperty,
    share_link_state: writeShareLinkStateOutputProperty,
  },
};

export const MCP_CREATE_EDIT_PROGRAM_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

export const MCP_DESTRUCTIVE_WRITE_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;
