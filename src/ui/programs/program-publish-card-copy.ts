import type {
  ProgramAutoSaveStatus,
  ShareLinkStatus,
} from "../../services/programs/types.js";
import {
  STICKY_EVERYTHING_LIVE_PREFIX,
  STICKY_NO_OPEN_LINK_HELPER,
  STICKY_NOT_PUBLISHED_HELPER,
} from "../copy/program-publish.js";
import { formatProgramPublishedAt } from "../copy/programs.js";

export function stickyPublishHelperText(input: {
  autoSaveStatus: ProgramAutoSaveStatus;
  shareLinkStatus: ShareLinkStatus;
  publishedAt: string | null;
  pendingChanges: boolean;
  changeCount: number;
}): string {
  const { autoSaveStatus, shareLinkStatus, publishedAt, pendingChanges, changeCount } =
    input;

  if (autoSaveStatus.kind === "not_published_yet") {
    return STICKY_NOT_PUBLISHED_HELPER;
  }
  if (pendingChanges) {
    const changesWord = changeCount === 1 ? "change" : "changes";
    const countPart = changeCount > 0 ? String(changeCount) : "1";
    return `${countPart} ${changesWord} not live yet. Publishing updates what your patient sees on the share link.`;
  }
  if (shareLinkStatus !== "open") {
    return STICKY_NO_OPEN_LINK_HELPER;
  }
  if (publishedAt) {
    return `${STICKY_EVERYTHING_LIVE_PREFIX} Published ${formatProgramPublishedAt(publishedAt)}.`;
  }
  return STICKY_NO_OPEN_LINK_HELPER;
}
