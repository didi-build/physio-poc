import {
  FAILED_KEEP_YOUR_VERSION,
  FAILED_SWITCH_TO_LIBRARY,
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
