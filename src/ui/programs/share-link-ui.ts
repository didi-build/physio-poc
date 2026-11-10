import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import type { ProgramShareConnectorView } from "../../services/programs/program-publish-service.js";
import { torontoTomorrowEarliestDateOnly } from "../../domain/toronto-calendar.js";

/** Expired link the server can revive on the same token (share_link_state from GET). */
export function isExpiredShareLinkRevive(
  shareView: ProgramShareConnectorView | null | undefined,
): boolean {
  return shareView?.share_link_state === "expired";
}

/** Closed / new-link UI — not an expired revive the server treats as same link. */
export function isGenuinelyClosedShareLink(
  shareView: ProgramShareConnectorView | null | undefined,
): boolean {
  if (!shareView) {
    return false;
  }
  if (isExpiredShareLinkRevive(shareView)) {
    return false;
  }
  return shareView.share_link_status === "closed";
}

/** Publish sheet / toast: republish on the same URL (open or expired revive). */
export function isSameLinkPublish(
  shareView: ProgramShareConnectorView | null | undefined,
): boolean {
  if (!shareView) {
    return false;
  }
  if (shareView.open_share_link && shareView.share_link_status === "open") {
    return true;
  }
  return isExpiredShareLinkRevive(shareView);
}

/** True when the custom date-only value is before the earliest selectable Toronto day. */
export function customExpiresOnIsBeforeEarliestPickable(
  dateOnly: string,
  now: Date = new Date(),
): boolean {
  const trimmed = dateOnly.trim();
  if (!trimmed) {
    return true;
  }
  return trimmed < torontoTomorrowEarliestDateOnly(now);
}

export function savedCustomExpiryIsStale(
  shareView: ProgramShareConnectorView | null | undefined,
): boolean {
  return (
    shareView?.link_expires_in === SHARE_LINK_EXPIRES_IN.custom_date &&
    customExpiresOnIsBeforeEarliestPickable(shareView.link_expires_on ?? "")
  );
}

export function initialPublishExpiryChoice(
  shareView: ProgramShareConnectorView | null,
): ShareLinkExpiresIn {
  if (shareView?.link_expires_in) {
    if (savedCustomExpiryIsStale(shareView) && isExpiredShareLinkRevive(shareView)) {
      return shareView.practitioner_default_expires_in;
    }
    return shareView.link_expires_in;
  }
  return shareView?.practitioner_default_expires_in ?? SHARE_LINK_EXPIRES_IN.one_year;
}
