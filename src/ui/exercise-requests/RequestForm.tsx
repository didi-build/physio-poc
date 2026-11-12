import { useId, useState } from "react";
import {
  CONCEPT_DEMO_PREFIX,
  CONCEPT_DEMO_TEXT,
  EXERCISE,
  NOTE_FOR_AI,
  NOTE_PLACEHOLDER,
  OPTIONAL,
  REQUEST_HEADING,
  REQUEST_NONE_HEADING,
  REQUEST_SUBTEXT,
  SUBMIT_REQUEST,
} from "../copy/exercise-library.js";
import { AI_DRAFTING, VIEW_REQUEST } from "../copy/exercise-requests.js";

export type RequestFormProps = {
  exerciseName: string;
  onExerciseNameChange: (value: string) => void;
  showNoneHeading: boolean;
  leadHeading?: string;
  leadLine?: string;
  note: string;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  showConceptDemo?: boolean;
  conceptDemoChecked?: boolean;
  onConceptDemoChange?: (checked: boolean) => void;
};

export function RequestForm({
  exerciseName,
  onExerciseNameChange,
  showNoneHeading,
  leadHeading,
  leadLine,
  note,
  onNoteChange,
  onSubmit,
  submitting = false,
  showConceptDemo = false,
  conceptDemoChecked = false,
  onConceptDemoChange,
}: RequestFormProps) {
  const headingId = useId();
  const exerciseInputId = useId();
  const trimmedExercise = exerciseName.trim();
  const hasLead = Boolean(leadHeading);

  return (
    <section
      className="ex-request-card"
      aria-labelledby={headingId}
      data-testid="exercise-request-card"
    >
      <div className="ex-request-card-inner">
        <div className="ex-request-card-copy">
          {hasLead ? (
            <div className="ex-request-lead">
              <h2 className="ex-request-lead-heading">{leadHeading}</h2>
              {leadLine ? <p className="ex-request-lead-line">{leadLine}</p> : null}
            </div>
          ) : null}
          {hasLead ? (
            <div className="ex-request-lead-divider" role="presentation" />
          ) : null}
          <h2
            id={headingId}
            className={
              hasLead
                ? "ex-request-heading ex-request-heading--with-lead"
                : "ex-request-heading"
            }
          >
            {showNoneHeading ? REQUEST_NONE_HEADING : REQUEST_HEADING}
          </h2>
          <p className="ex-request-subtext">{REQUEST_SUBTEXT}</p>
        </div>
        <form
          className="ex-request-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label htmlFor={exerciseInputId} className="ex-request-field-label">
            {EXERCISE}
          </label>
          <input
            id={exerciseInputId}
            className="ex-input"
            value={exerciseName}
            onChange={(event) => {
              onExerciseNameChange(event.target.value);
            }}
            disabled={submitting}
          />
          <label htmlFor="ex-req-note" className="ex-request-field-label">
            {NOTE_FOR_AI} <span className="ex-muted">{OPTIONAL}</span>
          </label>
          <input
            id="ex-req-note"
            className="ex-input"
            placeholder={NOTE_PLACEHOLDER}
            value={note}
            onChange={(event) => {
              onNoteChange(event.target.value);
            }}
            disabled={submitting}
          />
          <button
            type="submit"
            className="ex-primary-btn ex-request-submit"
            disabled={submitting || trimmedExercise.length === 0}
          >
            {SUBMIT_REQUEST}
          </button>
          {showConceptDemo ? (
            <label className="ex-concept-demo">
              <input
                type="checkbox"
                checked={conceptDemoChecked}
                onChange={(event) => {
                  onConceptDemoChange?.(event.target.checked);
                }}
              />
              <span>
                <span className="ex-concept-demo-prefix">{CONCEPT_DEMO_PREFIX}</span>{" "}
                {CONCEPT_DEMO_TEXT}
              </span>
            </label>
          ) : null}
        </form>
      </div>
    </section>
  );
}

export type RequestSubmittedProps = {
  exerciseName: string;
  onViewRequest: () => void;
};

export function RequestSubmittedPanel({
  exerciseName,
  onViewRequest,
}: RequestSubmittedProps) {
  const [requestedLabel] = useState(() => exerciseName);
  return (
    <section className="ex-request-card" data-testid="exercise-request-card">
      <div className="ex-request-submitted">
        <div className="ex-request-submitted-body">
          <h2 className="ex-request-submitted-title">Requested: {requestedLabel}</h2>
          <span className="ex-tag ex-tag--drafting">{AI_DRAFTING}</span>
        </div>
        <button type="button" className="ex-primary-btn" onClick={onViewRequest}>
          {VIEW_REQUEST}
        </button>
      </div>
    </section>
  );
}
