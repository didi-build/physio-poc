import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { CANCEL } from "../copy/my-defaults.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import {
  BACK_TO_PROGRAM,
  CLOSE_LINK,
  CLOSE_LINK_PROGRAM_KEPT,
  CLOSE_SHARE_LINK_SHEET_TITLE,
  COPY_LINK,
  CREATE_NEW_LINK,
  DOWNLOAD_PDF,
  LINK_CLOSED,
  LINK_EXPIRES_HEADING,
  LINK_EXPIRES_THIS_PROGRAM,
  LINK_PAGE,
  PDF_PREVIEW_CAPTION,
  PDF_PREVIEW_LABEL,
  SHARE_ACTION,
  SHARE_LINK_ACTIVE_HELPER,
  SHARE_LINK_HEADING,
  SHARE_PROGRAM_TITLE,
  UNTITLED_PROGRAM,
  cardExerciseCountLine,
  programCodeChipLabel,
} from "../copy/programs.js";
import {
  ProgramsBuilderBusyState,
  ProgramsBuilderErrorSlot,
} from "./ProgramsStates.js";
import { useProgramFromRouteCode } from "./use-program-from-route-code.js";

export function ProgramSharePage() {
  const { programCode, program, loading, loadFailed } = useProgramFromRouteCode();
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);

  const builderPath = useMemo(
    () =>
      programCode.trim().length > 0
        ? fillPhysioAppRoutePattern("programBuilder", { programCode })
        : fillPhysioAppRoutePattern("programs"),
    [programCode],
  );

  const linkClosed = program?.share_link_status === "closed";

  if (loading) {
    return (
      <section
        className="pg-page pg-share-page"
        data-testid="program-share-page"
        aria-busy
      >
        <ProgramsBuilderBusyState />
      </section>
    );
  }

  if (loadFailed || !program) {
    return (
      <section className="pg-page pg-share-page" data-testid="program-share-page">
        <ProgramsBuilderErrorSlot />
      </section>
    );
  }

  const displayName = program.name?.trim() ? program.name.trim() : UNTITLED_PROGRAM;

  return (
    <section className="pg-page pg-share-page" data-testid="program-share-page">
      <Link to={builderPath} className="ex-back-link">
        {BACK_TO_PROGRAM}
      </Link>
      <h1 className="pg-page-title">{SHARE_PROGRAM_TITLE}</h1>

      <div className="pg-share-layout">
        <div className="pg-share-preview" aria-label={PDF_PREVIEW_LABEL}>
          <p className="pg-share-preview-title">{displayName}</p>
          <p className="pg-share-preview-meta">
            {programCodeChipLabel(program.code)} ·{" "}
            {cardExerciseCountLine(program.exercise_count)}
          </p>
          <p className="pg-share-preview-caption">{PDF_PREVIEW_CAPTION}</p>
        </div>

        <aside className="pg-share-sidebar">
          <h2 className="pg-section-heading">{SHARE_LINK_HEADING}</h2>
          {linkClosed ? (
            <p className="pg-share-link-closed">{LINK_CLOSED}</p>
          ) : (
            <>
              <div className="pg-share-link-row">
                <span className="pg-share-link-row-url">{program.code}</span>
                <button type="button" className="pg-btn pg-btn--secondary">
                  {COPY_LINK}
                </button>
              </div>
              <p className="pg-publish-helper">{SHARE_LINK_ACTIVE_HELPER}</p>
            </>
          )}

          <div className="pg-link-expiry-heading-row">
            <h2 className="pg-section-heading">{LINK_EXPIRES_HEADING}</h2>
            <span className="pg-link-expiry-scope">{LINK_EXPIRES_THIS_PROGRAM}</span>
          </div>

          <ul className="pg-share-actions">
            <li>
              <button type="button" className="pg-share-action-btn">
                {LINK_PAGE}
              </button>
            </li>
            <li>
              <button type="button" className="pg-share-action-btn">
                {DOWNLOAD_PDF}
              </button>
            </li>
            {!linkClosed ? (
              <li>
                <button
                  type="button"
                  className="pg-share-action-btn pg-share-action-btn--danger"
                  onClick={() => {
                    setCloseSheetOpen(true);
                  }}
                >
                  {CLOSE_LINK}
                </button>
              </li>
            ) : null}
          </ul>

          {linkClosed ? (
            <button type="button" className="pg-btn pg-btn--primary pg-share-new-link">
              {CREATE_NEW_LINK}
            </button>
          ) : (
            <button
              type="button"
              className="pg-btn pg-btn--primary pg-share-mobile-share"
            >
              {SHARE_ACTION}
            </button>
          )}
        </aside>
      </div>

      <ConfirmSheet
        open={closeSheetOpen}
        title={CLOSE_SHARE_LINK_SHEET_TITLE}
        titleId="pg-close-link-title"
        onClose={() => {
          setCloseSheetOpen(false);
        }}
        footer={
          <div className="pg-publish-actions">
            <button
              type="button"
              className="pg-btn pg-btn--secondary"
              onClick={() => {
                setCloseSheetOpen(false);
              }}
            >
              {CANCEL}
            </button>
            <button type="button" className="pg-btn pg-btn--danger">
              {CLOSE_LINK}
            </button>
          </div>
        }
      >
        <p>{CLOSE_LINK_PROGRAM_KEPT}</p>
      </ConfirmSheet>
    </section>
  );
}
