import { useEffect, useId, useRef, useState } from "react";
import {
  MISSING_IMAGES_BLOCK_BODY_ONE_ROUTINE,
  MISSING_IMAGES_BLOCK_HEADING,
  MISSING_IMAGES_NONE_LEFT,
  missingImagesBlockBodyManyRoutine,
  missingImagesRemovedLiveRoutine,
} from "../copy/routines.js";
import { removeRowAriaLabel } from "../copy/programs.js";
import {
  focusRemoveButtonInNotice,
  nextRemoveButtonIndex,
} from "../programs/publish-notice-remove-focus.js";

export type RoutinePublishMissingImagesRow = {
  position: number;
  title: string;
};

export type RoutinePublishMissingImagesNoticeProps = {
  rows: readonly RoutinePublishMissingImagesRow[];
  focusHeading: boolean;
  serverRejected?: boolean;
  onRemove: (position: number) => void;
};

export function RoutinePublishMissingImagesNotice({
  rows,
  focusHeading,
  serverRejected = false,
  onRemove,
}: RoutinePublishMissingImagesNoticeProps) {
  const headingId = useId();
  const listEmpty = rows.length === 0;
  const showBlockHeading = !listEmpty || serverRejected;
  const [liveMessage, setLiveMessage] = useState("");
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusHeading || !showBlockHeading) {
      return;
    }
    const heading = noticeRef.current?.querySelector("h3");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [focusHeading, showBlockHeading]);

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

  const heading = showBlockHeading
    ? MISSING_IMAGES_BLOCK_HEADING
    : MISSING_IMAGES_NONE_LEFT;

  return (
    <section
      ref={noticeRef}
      data-testid="routine-publish-missing-images-notice"
      className={`pg-placeholder-notice${
        listEmpty ? " pg-placeholder-notice--clear" : ""
      }`}
      role="status"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="pg-placeholder-notice-heading" tabIndex={-1}>
        {heading}
      </h3>
      {listEmpty ? null : (
        <p className="pg-placeholder-notice-body">
          {rows.length === 1
            ? MISSING_IMAGES_BLOCK_BODY_ONE_ROUTINE
            : missingImagesBlockBodyManyRoutine(rows.length)}
        </p>
      )}
      {listEmpty ? null : (
        <ul className="pg-placeholder-list">
          {rows.map((row) => (
            <li key={row.position} className="pg-placeholder-row">
              <span className="pg-placeholder-name">{row.title}</span>
              <button
                type="button"
                className="pg-icon-btn pg-icon-btn--remove"
                aria-label={removeRowAriaLabel(row.title)}
                onClick={() => {
                  const removedIndex = rows.findIndex(
                    (p) => p.position === row.position,
                  );
                  onRemove(row.position);
                  const remaining = rows.filter((p) => p.position !== row.position);
                  const removed = missingImagesRemovedLiveRoutine(row.title);
                  if (remaining.length === 0) {
                    setLiveMessage(`${removed} ${MISSING_IMAGES_NONE_LEFT}`);
                    noticeRef.current?.querySelector("h3")?.focus();
                  } else {
                    setLiveMessage(removed);
                    const focusIndex = nextRemoveButtonIndex(
                      removedIndex,
                      remaining.length,
                    );
                    focusRemoveButtonInNotice(
                      noticeRef.current,
                      remaining[focusIndex]!.title,
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
      <p className="sr-only" aria-live="polite">
        {liveMessage}
      </p>
    </section>
  );
}
