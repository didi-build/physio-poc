import {
  FAILED_APPROVE_DRAFT,
  FAILED_DISCARD_DRAFT,
  FAILED_KEEP_YOUR_VERSION,
  FAILED_MERGE_EXERCISES,
  FAILED_PUBLISH_PROGRAM,
  FAILED_PUBLISH_ROUTINE,
  FAILED_REGENERATE_IMAGES,
  FAILED_REMOVE_EXERCISE_FROM_BUILDER,
  FAILED_RESTORE_PROGRAM,
  FAILED_RESTORE_THIS_VERSION,
  FAILED_SAVE_DRAFT,
  FAILED_SAVE_DRAFT_EDITS,
  FAILED_SAVE_LINK_EXPIRY,
  FAILED_SAVE_YOUR_DEFAULT,
  FAILED_SUBMIT_REQUEST,
  FAILED_SWITCH_TO_LIBRARY,
  FAILED_SWITCH_TO_THIS_VERSION,
  type LoadItemToken,
  failedRemoveItem,
  failedSaveItem,
} from "../copy/shared-load-states.js";

/** Locked mapping for the ten known actions (DIDI-1080 spec table). */

export type MappedFailedSaveAction =
  | { kind: "save_or_edit"; item: LoadItemToken }
  | { kind: "delete_or_remove"; item: LoadItemToken }
  | { kind: "switch_library_version" }
  | { kind: "keep_your_version" };

export function mappedFailedSaveMessage(action: MappedFailedSaveAction): string {
  switch (action.kind) {
    case "save_or_edit":
      return failedSaveItem(action.item);
    case "delete_or_remove":
      return failedRemoveItem(action.item);
    case "switch_library_version":
      return FAILED_SWITCH_TO_LIBRARY;
    case "keep_your_version":
      return FAILED_KEEP_YOUR_VERSION;
  }
}

/** DIDI-1273 Designer-pick actions (spec Failed-save strings table). */

export type Didi1273FailedSaveAction =
  | "exercise_regenerate_media"
  | "exercise_restore_version"
  | "exercise_merge"
  | "routine_draft_autosave"
  | "routine_publish"
  | "routine_discard_draft"
  | "routine_adopt_version"
  | "routine_restore_version"
  | "program_builder_autosave"
  | "program_publish"
  | "program_restore"
  | "program_remove_exercise_row"
  | "program_link_expiry"
  | "request_submit"
  | "request_draft_edits"
  | "request_approve"
  | "request_discard_draft"
  | "defaults_share_link"
  | "defaults_exercise_type_row";

export function didi1273FailedSaveMessage(action: Didi1273FailedSaveAction): string {
  switch (action) {
    case "exercise_regenerate_media":
      return FAILED_REGENERATE_IMAGES;
    case "exercise_restore_version":
    case "routine_restore_version":
      return FAILED_RESTORE_THIS_VERSION;
    case "exercise_merge":
      return FAILED_MERGE_EXERCISES;
    case "routine_draft_autosave":
      return FAILED_SAVE_DRAFT;
    case "routine_publish":
      return FAILED_PUBLISH_ROUTINE;
    case "routine_discard_draft":
    case "request_discard_draft":
      return FAILED_DISCARD_DRAFT;
    case "routine_adopt_version":
      return FAILED_SWITCH_TO_THIS_VERSION;
    case "program_builder_autosave":
      return failedSaveItem("program");
    case "program_publish":
      return FAILED_PUBLISH_PROGRAM;
    case "program_restore":
      return FAILED_RESTORE_PROGRAM;
    case "program_remove_exercise_row":
      return FAILED_REMOVE_EXERCISE_FROM_BUILDER;
    case "program_link_expiry":
      return FAILED_SAVE_LINK_EXPIRY;
    case "request_submit":
      return FAILED_SUBMIT_REQUEST;
    case "request_draft_edits":
      return FAILED_SAVE_DRAFT_EDITS;
    case "request_approve":
      return FAILED_APPROVE_DRAFT;
    case "defaults_share_link":
    case "defaults_exercise_type_row":
      return FAILED_SAVE_YOUR_DEFAULT;
  }
}

export function programAutosaveFailedSaveMessage(lastFailedKey: string | null): string {
  if (lastFailedKey?.startsWith("delete-row:")) {
    return didi1273FailedSaveMessage("program_remove_exercise_row");
  }
  return didi1273FailedSaveMessage("program_builder_autosave");
}

export function routineDraftAutosaveFailedSaveMessage(): string {
  return didi1273FailedSaveMessage("routine_draft_autosave");
}
