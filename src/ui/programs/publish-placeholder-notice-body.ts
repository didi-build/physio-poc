import type { ProgramBuilderRow } from "../../services/programs/types.js";
import {
  PLACEHOLDER_BLOCK_BODY_ONE,
  placeholderBlockBodyMany,
} from "../copy/program-publish.js";
import {
  TYPE_MISMATCH_PUBLISH_NOTICE_T18,
  TYPE_MISMATCH_PUBLISH_NOTICE_T19,
} from "../copy/program-type-mismatch.js";

export function publishPlaceholderNoticeBody(
  placeholders: readonly ProgramBuilderRow[],
): string {
  const hasTypeMismatch = placeholders.some(
    (row) => row.placeholder_state === "type_mismatch",
  );
  const hasAwaiting = placeholders.some(
    (row) => row.placeholder_state !== "type_mismatch",
  );
  if (hasTypeMismatch && !hasAwaiting) {
    return TYPE_MISMATCH_PUBLISH_NOTICE_T19;
  }
  const approvedBody =
    placeholders.length === 1
      ? PLACEHOLDER_BLOCK_BODY_ONE
      : placeholderBlockBodyMany(placeholders.length);
  if (hasTypeMismatch && hasAwaiting) {
    return `${approvedBody} ${TYPE_MISMATCH_PUBLISH_NOTICE_T18}`;
  }
  return approvedBody;
}
