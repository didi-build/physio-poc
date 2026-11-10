import { PROGRAM_PUBLISH_NAME_REQUIRED } from "../../copy/programs-share.js";
import { PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE } from "../../storage/repositories/programs.js";
import { ProgramsApiError } from "../api/programs-client.js";
import { PROGRAM_PUBLISH_ERROR_MESSAGE } from "../copy/programs-states.js";

/** Spec-approved messages only; never surface raw HTTP or server fallbacks. */
export function publishApiUserMessage(error: ProgramsApiError): string | null {
  if (error.code === "name_required") {
    return PROGRAM_PUBLISH_NAME_REQUIRED;
  }
  if (error.code === "placeholders_block_publish") {
    return PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE;
  }
  return PROGRAM_PUBLISH_ERROR_MESSAGE ?? null;
}
