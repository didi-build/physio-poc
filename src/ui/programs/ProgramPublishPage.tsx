import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import { SHARE_LINK_EXPIRES_IN } from "../../mcp-connector/share-link-expiry.js";
import { SHARE_LINK_EXPIRY_CHOICE_LABELS } from "../copy/my-defaults.js";
import {
  ADD_PROGRAM_NAME_TO_PUBLISH,
  ANYONE_NEW_LINK_HELPER,
  BACK_TO_PROGRAM,
  COPY_LINK,
  LINK_EXPIRES_HEADING,
  LINK_EXPIRES_THIS_PROGRAM,
  PICK_A_DATE,
  PROGRAM_NAME_LABEL,
  PROGRAM_NAME_REQUIRED_SUFFIX,
  PUBLISH_EXPIRY_APPLIES_NEW,
  PUBLISH_FIRST_HEADING,
  PUBLISH_NO_LINK_YET,
  PUBLISH_NOT_YET,
  PUBLISH_NOW,
  PUBLISH_SAME_LINK_HELPER,
  PUBLISH_SHEET_TITLE,
  SHARE_LINK_HEADING,
  UNTITLED_PROGRAM,
  cardExerciseCountLine,
  programCodeChipLabel,
  publishChangesSinceHeading,
} from "../copy/programs.js";
import {
  ProgramsBuilderBusyState,
  ProgramsBuilderErrorSlot,
} from "./ProgramsStates.js";
import { useProgramFromRouteCode } from "./use-program-from-route-code.js";

const EXPIRY_CHOICES = [
  SHARE_LINK_EXPIRES_IN.one_week,
  SHARE_LINK_EXPIRES_IN.thirty_days,
  SHARE_LINK_EXPIRES_IN.ninety_days,
  SHARE_LINK_EXPIRES_IN.one_year,
  SHARE_LINK_EXPIRES_IN.never,
] as const;

export function ProgramPublishPage() {
  const { programCode, program, loading, loadFailed } = useProgramFromRouteCode();
  const [nameDraft, setNameDraft] = useState("");

  const neverPublished = program?.auto_save_status.kind === "not_published_yet";
  const publishedAt =
    program?.auto_save_status.kind === "published"
      ? program.auto_save_status.published_at
      : undefined;
  const noLink =
    program?.share_link_status === "none" || program?.share_link_status === "closed";
  const showNameField = neverPublished || !(program?.name?.trim().length ?? 0);

  useEffect(() => {
    if (program?.name?.trim()) {
      setNameDraft(program.name.trim());
    }
  }, [program?.name]);

  const builderPath = useMemo(
    () =>
      programCode.trim().length > 0
        ? fillPhysioAppRoutePattern("programBuilder", { programCode })
        : fillPhysioAppRoutePattern("programs"),
    [programCode],
  );

  if (loading) {
    return (
      <section
        className="pg-page pg-publish-page"
        data-testid="program-publish-page"
        aria-busy
      >
        <ProgramsBuilderBusyState />
      </section>
    );
  }

  if (loadFailed || !program) {
    return (
      <section className="pg-page pg-publish-page" data-testid="program-publish-page">
        <ProgramsBuilderErrorSlot />
      </section>
    );
  }

  const displayName = program.name?.trim() ? program.name.trim() : UNTITLED_PROGRAM;
  const nameValue = showNameField ? nameDraft : displayName;
  const nameMissing = showNameField && nameValue.trim().length === 0;

  return (
    <section className="pg-page pg-publish-page" data-testid="program-publish-page">
      <Link to={builderPath} className="ex-back-link">
        {BACK_TO_PROGRAM}
      </Link>
      <h1 className="pg-page-title">{PUBLISH_SHEET_TITLE}</h1>

      <div className="pg-publish-card-summary">
        <p className="pg-publish-card-summary-name">{displayName}</p>
        <p className="pg-publish-card-summary-meta">
          {programCodeChipLabel(program.code)} ·{" "}
          {cardExerciseCountLine(program.exercise_count)}
        </p>
      </div>

      {showNameField ? (
        <div className="pg-name-field pg-publish-name-field">
          <label htmlFor="pg-publish-name">
            <span id="pg-publish-name-label">
              {PROGRAM_NAME_LABEL} {PROGRAM_NAME_REQUIRED_SUFFIX}
            </span>
          </label>
          <input
            id="pg-publish-name"
            type="text"
            aria-labelledby="pg-publish-name-label"
            aria-invalid={nameMissing ? true : undefined}
            value={nameDraft}
            onChange={(event) => {
              setNameDraft(event.target.value);
            }}
          />
          {nameMissing ? (
            <p className="pg-name-error" role="alert">
              {ADD_PROGRAM_NAME_TO_PUBLISH}
            </p>
          ) : null}
        </div>
      ) : null}

      <h2 className="pg-section-heading">
        {neverPublished
          ? PUBLISH_FIRST_HEADING
          : publishedAt
            ? publishChangesSinceHeading(publishedAt)
            : PUBLISH_FIRST_HEADING}
      </h2>

      <h2 className="pg-section-heading">{SHARE_LINK_HEADING}</h2>
      {noLink ? (
        <p className="pg-publish-no-link">{PUBLISH_NO_LINK_YET}</p>
      ) : (
        <div className="pg-share-link-row">
          <span className="pg-share-link-row-url">{program.code}</span>
          <button type="button" className="pg-btn pg-btn--secondary">
            {COPY_LINK}
          </button>
        </div>
      )}
      <p className="pg-publish-helper">
        {noLink ? ANYONE_NEW_LINK_HELPER : PUBLISH_SAME_LINK_HELPER}
      </p>

      <div className="pg-link-expiry-block">
        <div className="pg-link-expiry-heading-row">
          <h2 className="pg-section-heading">{LINK_EXPIRES_HEADING}</h2>
          <span className="pg-link-expiry-scope">{LINK_EXPIRES_THIS_PROGRAM}</span>
        </div>
        <div
          className="pg-expiry-choices"
          role="group"
          aria-label={LINK_EXPIRES_HEADING}
        >
          {EXPIRY_CHOICES.map((choice) => (
            <button key={choice} type="button" className="pg-expiry-choice">
              {SHARE_LINK_EXPIRY_CHOICE_LABELS[choice]}
            </button>
          ))}
          <button type="button" className="pg-expiry-choice">
            {PICK_A_DATE}
          </button>
        </div>
        <p className="pg-publish-helper">{PUBLISH_EXPIRY_APPLIES_NEW}</p>
      </div>

      <div className="pg-publish-actions">
        <Link to={builderPath} className="pg-btn pg-btn--secondary">
          {PUBLISH_NOT_YET}
        </Link>
        <button type="button" className="pg-btn pg-btn--primary" disabled={nameMissing}>
          {PUBLISH_NOW}
        </button>
      </div>
    </section>
  );
}
