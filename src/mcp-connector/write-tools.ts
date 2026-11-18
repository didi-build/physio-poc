import type { JsonSchema } from "./json-schema.js";
import {
  draftStateOutputProperty,
  exerciseCountOutputProperty,
  exerciseNotFoundSchema,
  expiresAtOutputProperty,
  nullableProgramTitleProperty,
  nullableProgramVersionRefSchema,
  pdfUrlOutputProperty,
  programCodeProperty,
  programRowInputSchema,
  programRowOutputSchema,
  programTitleProperty,
  publishChangeLinesOutputProperty,
  publishOverridesInputSchema,
  restoreUntilOutputProperty,
  routineIdProperty,
  shareLinkCustomDateInputProperty,
  shareLinkExpiresInInputProperty,
  shareLinkOutputProperty,
  shareLinkStateOutputProperty,
  summaryOutputProperty,
  manageUrlOutputProperty,
} from "./json-schema.js";

export const CREATE_OR_EDIT_PROGRAM_TOOL_NAME = "create_or_edit_program" as const;

export const createOrEditProgramDescription =
  "Create or replace a program. Omit program_code to create; pass program_code to replace that program's full rows list (no incremental ops). Create from a routine with from_routine_id in one call; optional rows replaces the copied rows. Records source_routine_id on the program. Each row uses exercise_version_id or exercise_name, not both; the server resolves names and omits unresolved rows (no placeholder rows). Unresolved names appear in exercises_not_found with up to three candidates and a prefilled web app search link (built from server config). Never publishes. Do not pass patient information in program_title or row_notes.";

export const createOrEditProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: programCodeProperty,
    program_title: programTitleProperty,
    from_routine_id: {
      ...routineIdProperty,
      description:
        "When creating a new program, copy rows from this routine id. Optional rows replaces the copy in the same call.",
    },
    rows: {
      type: "array",
      items: programRowInputSchema,
      description: "Full rows list that replaces the program contents on save.",
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
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
    program_code: programCodeProperty,
    program_title: nullableProgramTitleProperty,
    source_routine_id: routineIdProperty,
    exercise_count: exerciseCountOutputProperty,
    rows: {
      type: "array",
      items: programRowOutputSchema,
    },
    exercises_not_found: {
      type: "array",
      items: exerciseNotFoundSchema,
      description:
        "Exercise names that were not resolved to exactly one approved exercise.",
    },
  },
};

export const PUBLISH_PROGRAM_TOOL_NAME = "publish_program" as const;

export const publishProgramDescription =
  "Publish the current program draft to the live share link (republishing updates the live version on the same link). Requires program_code. Before calling, read the program with get_program_share_link_or_pdf so you know the program name, whether a published version exists, draft_state, and current expiry. Call only after the user explicitly confirms in the conversation: say which version they want when draft changes exist (published link vs publishing the draft first), then confirm publish with default expiry or the overrides you will send. Optional overrides.expires_in sets expiry (1_week, 30_days, 90_days, 1_year, never, or custom_date with overrides.custom_date); omit overrides to use the practitioner default. Do not pass patient information.";

export const publishProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code"],
  properties: {
    program_code: programCodeProperty,
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
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    pdf_url: pdfUrlOutputProperty,
    manage_url: manageUrlOutputProperty,
    expires_at: expiresAtOutputProperty,
    program_code: programCodeProperty,
    program_title: nullableProgramTitleProperty,
    draft_state: draftStateOutputProperty,
    draft: nullableProgramVersionRefSchema,
    published: nullableProgramVersionRefSchema,
    share_link_state: shareLinkStateOutputProperty,
    publish_change_lines: publishChangeLinesOutputProperty,
  },
};

export const SET_PROGRAM_LINK_EXPIRY_TOOL_NAME = "set_program_link_expiry" as const;

export const setProgramLinkExpiryDescription =
  "Change when one program's published share link expires. Requires program_code and expires_in (1_week, 30_days, 90_days, 1_year, never, or custom_date with custom_date). Call directly when the user's message already names the date or expiry; otherwise get explicit confirmation in the conversation first. Do not pass patient information.";

export const setProgramLinkExpiryInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code", "expires_in"],
  properties: {
    program_code: programCodeProperty,
    expires_in: shareLinkExpiresInInputProperty,
    custom_date: shareLinkCustomDateInputProperty,
  },
};

export const setProgramLinkExpiryOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "manage_url", "program_code"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
    expires_at: expiresAtOutputProperty,
    program_code: programCodeProperty,
    program_title: nullableProgramTitleProperty,
    share_link_state: shareLinkStateOutputProperty,
  },
};

export const DELETE_PROGRAM_TOOL_NAME = "delete_program" as const;

export const deleteProgramDescription =
  "Delete a program by program_code. This closes its share link when open. The program moves to Recently deleted in the web app and can be restored for 30 days. Call only after the user explicitly confirms in the conversation. Do not pass patient information.";

export const deleteProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code"],
  properties: {
    program_code: programCodeProperty,
  },
};

export const deleteProgramOutputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "share_link", "manage_url", "program_code", "restore_until"],
  properties: {
    summary: summaryOutputProperty,
    share_link: shareLinkOutputProperty,
    manage_url: manageUrlOutputProperty,
    program_code: programCodeProperty,
    program_title: nullableProgramTitleProperty,
    restore_until: restoreUntilOutputProperty,
    share_link_state: shareLinkStateOutputProperty,
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
