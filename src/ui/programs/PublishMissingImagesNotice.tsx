import { useEffect, useId, useRef, useState } from "react";
import {
  MISSING_IMAGES_BLOCK_BODY_ONE_PROGRAM,
  MISSING_IMAGES_BLOCK_HEADING,
  MISSING_IMAGES_NONE_LEFT,
  missingImagesBlockBodyManyProgram,
  missingImagesRemovedLiveProgram,
  notLiveStillPublishedHelper,
} from "../copy/program-publish.js";
import { removeRowAriaLabel } from "../copy/programs.js";

export type PublishMissingImagesRow = {
  id: string;
  title: string;
};

export type PublishMissingImagesNoticeProps = {
  rows: readonly PublishMissingImagesRow[];
  showRepublishLine: boolean;
  publishedAt: string | null;
  focusHeading: boolean;
  serverRejected?: boolean;
  onRemove: (rowId: string) => void;
};

export function PublishMissingImagesNotice({
  rows,
  showRepublishLine,
  publishedAt,
  focusHeading,
  serverRejected = false,
  onRemove,
}: PublishMissingImagesNoticeProps) {
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
      data-testid="publish-missing-images-notice"
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
            ? MISSING_IMAGES_BLOCK_BODY_ONE_PROGRAM
            : missingImagesBlockBodyManyProgram(rows.length)}
        </p>
      )}
      {listEmpty ? null : (
        <ul className="pg-placeholder-list">
          {rows.map((row) => (
            <li key={row.id} className="pg-placeholder-row">
              <span className="pg-placeholder-name">{row.title}</span>
              <button
                type="button"
                className="pg-icon-btn pg-icon-btn--remove"
                aria-label={removeRowAriaLabel(row.title)}
                onClick={() => {
                  onRemove(row.id);
                  const remaining = rows.filter((p) => p.id !== row.id);
                  const removed = missingImagesRemovedLiveProgram(row.title);
                  if (remaining.length === 0) {
                    setLiveMessage(`${removed} ${MISSING_IMAGES_NONE_LEFT}`);
                    noticeRef.current?.querySelector("h3")?.focus();
                  } else {
                    setLiveMessage(removed);
                    const next = noticeRef.current?.querySelector<HTMLButtonElement>(
                      `[aria-label="${removeRowAriaLabel(remaining[0]!.title)}"]`,
                    );
                    next?.focus();
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
