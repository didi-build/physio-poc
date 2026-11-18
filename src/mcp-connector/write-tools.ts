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

export const createOrEditProgramDescription = [
  "create or edit a program, create from a routine via create_or_edit_program with from_routine_id.",
  "exercises_not_found partial result:",
  "{name} isn't in your exercise library yet, and I can't create new exercises from here.",
  "You can request it in the web app. The search is already filled in:",
  "Once a practitioner approves it, ask me again and I'll add it to {program}. The rest of the program is unchanged.",
].join(" ");

export const publishProgramDescription = [
  "Before calling, read the program with get_program_share_link_or_pdf so the question has the real name, code, exercise count, link state and expiry.",
  "Publish {name}?",
  "Creates the share link. Anyone with it sees this version.",
  "Expires in {expiry} ({date}), your default.",
  "Reply yes to publish, or tell me a different expiry. No keeps it as a draft.",
  "A separate copy of {routine}, v{n}. Later routine edits won't change it.",
  "Code {code}. Creates the share link.",
  "Publish changes to {name}?",
  "One line per change from publish_change_lines.",
  "Your patient sees this on the same link right away.",
  "Reply yes to publish, or no to keep the changes as a draft.",
  "This isn't live yet.",
  "{name} has draft changes that aren't live yet. Do you want the link to the published version, or should I publish the draft first?",
  "I can set any date from tomorrow, with no latest date, or make it never expire.",
  "Expires in {expiry} ({date}).",
  "Never expires.",
].join(" ");

const routineIdWithoutDescription: JsonSchema = { ...routineIdProperty };
delete (routineIdWithoutDescription as { description?: string }).description;

export const createOrEditProgramInputSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    program_code: programCodeProperty,
    program_title: programTitleProperty,
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
    },
  },
};

export const PUBLISH_PROGRAM_TOOL_NAME = "publish_program" as const;

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

export const setProgramLinkExpiryDescription = [
  "Call directly when the user's message names the date or expiry; otherwise confirm first.",
  "Change the link for {name} to expire on {date}?",
  "Change the link for {name} to never expire?",
  "It's the same link. Right now it expires on {current_date}.",
  "It's the same link. Right now it never expires.",
  "Reply yes to change it, or no to leave it.",
].join(" ");

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

export const deleteProgramDescription = [
  "Delete {name}?",
  "{code}, {n} exercises. It moves to Recently deleted.",
  'Closes its share link, so anyone who opens it sees "This link was closed".',
  "You can restore it in the web app for 30 days.",
  "Reply yes to delete it, or no to keep it.",
].join(" ");

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
