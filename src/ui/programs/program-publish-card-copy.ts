import type {
  ProgramAutoSaveStatus,
  ShareLinkStatus,
} from "../../services/programs/types.js";
import {
  NOT_LIVE_NO_OPEN_LINK,
  STICKY_EVERYTHING_LIVE_PREFIX,
  STICKY_NO_OPEN_LINK_HELPER,
  STICKY_NOT_PUBLISHED_HELPER,
  notLiveStillPublishedHelper,
} from "../copy/program-publish.js";
import { formatProgramPublishedAt } from "../copy/programs.js";

export function stickyPublishHelperText(input: {
  autoSaveStatus: ProgramAutoSaveStatus;
  shareLinkStatus: ShareLinkStatus;
  publishedAt: string | null;
  pendingChanges: boolean;
}): string {
  const { autoSaveStatus, shareLinkStatus, publishedAt, pendingChanges } = input;

  if (autoSaveStatus.kind === "not_published_yet") {
    return STICKY_NOT_PUBLISHED_HELPER;
  }
  if (pendingChanges) {
    if (publishedAt) {
      return notLiveStillPublishedHelper(publishedAt);
    }
    if (shareLinkStatus !== "open") {
      return NOT_LIVE_NO_OPEN_LINK;
    }
    return STICKY_NOT_PUBLISHED_HELPER;
  }
  if (shareLinkStatus !== "open") {
    return STICKY_NO_OPEN_LINK_HELPER;
  }
  if (publishedAt) {
    return `${STICKY_EVERYTHING_LIVE_PREFIX} Published ${formatProgramPublishedAt(publishedAt)}.`;
  }
  return STICKY_NO_OPEN_LINK_HELPER;
}
