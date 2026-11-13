import { useEffect, useId, useRef, useState } from "react";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { Link } from "react-router-dom";
import type { ProgramBuilderRow } from "../../services/programs/types.js";
import {
  PLACEHOLDER_BLOCK_BODY_ONE,
  PLACEHOLDER_BLOCK_HEADING,
  PLACEHOLDER_NONE_LEFT,
  PLACEHOLDER_REVIEW_DRAFT,
  placeholderBlockBodyMany,
  placeholderRemovedLive,
  placeholderReviewDraftFor,
} from "../copy/program-publish.js";
import { PENDING_REVIEW_BADGE, removeRowAriaLabel } from "../copy/programs.js";
import { notLiveStillPublishedHelper } from "../copy/program-publish.js";
import {
  focusPlaceholderReviewDraftInNotice,
  nextRemoveButtonIndex,
} from "./publish-notice-remove-focus.js";

export type PublishPlaceholderNoticeProps = {
  placeholders: readonly ProgramBuilderRow[];
  showRepublishLine: boolean;
  publishedAt: string | null;
  onRemove: (rowId: string) => void;
};

export function PublishPlaceholderNotice({
  placeholders,
  showRepublishLine,
  publishedAt,
  onRemove,
}: PublishPlaceholderNoticeProps) {
  const headingId = useId();
  const listEmpty = placeholders.length === 0;
  const [liveMessage, setLiveMessage] = useState("");
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!liveMessage) {
      return;
    }
    const timer = setTimeout(() => {
      setLiveMessage("");
    }, 4_000);
    return () => {
      clearTimeout(timer);
    };
  }, [liveMessage]);

  const heading = listEmpty ? PLACEHOLDER_NONE_LEFT : PLACEHOLDER_BLOCK_HEADING;

  return (
    <section
      ref={noticeRef}
      className={`pg-placeholder-notice${
        listEmpty ? " pg-placeholder-notice--clear" : ""
      }`}
      role="status"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="pg-placeholder-notice-heading">
        {heading}
      </h3>
      {listEmpty ? null : (
        <p className="pg-placeholder-notice-body">
          {placeholders.length === 1
            ? PLACEHOLDER_BLOCK_BODY_ONE
            : placeholderBlockBodyMany(placeholders.length)}
        </p>
      )}
      {listEmpty ? null : (
        <ul className="pg-placeholder-list">
          {placeholders.map((row) => (
            <li key={row.id} className="pg-placeholder-row">
              <span className="pg-placeholder-name">{row.text_snapshot.title}</span>
              <span className="pg-placeholder-badge">{PENDING_REVIEW_BADGE}</span>
              <Link
                className="pg-link-btn"
                to={fillPhysioAppRoutePattern("requestReview", {
                  requestId: row.exercise_request_id ?? "",
                })}
              >
                {PLACEHOLDER_REVIEW_DRAFT}
                <span className="sr-only">
                  {placeholderReviewDraftFor(row.text_snapshot.title)}
                </span>
              </Link>
              <button
                type="button"
                className="pg-icon-btn pg-icon-btn--remove"
                aria-label={removeRowAriaLabel(row.text_snapshot.title)}
                onClick={() => {
                  const removedIndex = placeholders.findIndex((p) => p.id === row.id);
                  onRemove(row.id);
                  const remaining = placeholders.filter((p) => p.id !== row.id);
                  const removed = placeholderRemovedLive(row.text_snapshot.title);
                  if (remaining.length === 0) {
                    setLiveMessage(`${removed} ${PLACEHOLDER_NONE_LEFT}`);
                    noticeRef.current?.querySelector("h3")?.focus();
                  } else {
                    setLiveMessage(removed);
                    const focusIndex = nextRemoveButtonIndex(
                      removedIndex,
                      remaining.length,
                    );
                    focusPlaceholderReviewDraftInNotice(
                      noticeRef.current,
                      remaining[focusIndex]!.text_snapshot.title,
                    );
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {showRepublishLine && publishedAt ? (
        <p className="pg-placeholder-republish">
          {notLiveStillPublishedHelper(publishedAt)}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
    </section>
  );
}
