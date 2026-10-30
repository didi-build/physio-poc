import { programsPendingCopySlots } from "../copy/programs-pending-copy.js";

/** Sent date and link status need API fields (DIDI-1141). Not rendered until wired. */
export function ProgramCardSentAndLinkStatus(): null {
  void programsPendingCopySlots.cardSentDateLine;
  void programsPendingCopySlots.cardLinkStatusLine;
  return null;
}
