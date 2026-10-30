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

export type RequestFormPlaceholderProps = {
  exerciseName: string;
  showNoneHeading: boolean;
};

export function RequestFormPlaceholder({
  exerciseName,
  showNoneHeading,
}: RequestFormPlaceholderProps) {
  return (
    <div className="ex-request-placeholder">
      <div className="ex-request-copy">
        <h2 className="ex-request-heading">
          {showNoneHeading ? REQUEST_NONE_HEADING : REQUEST_HEADING}
        </h2>
        <p className="ex-request-subtext">{REQUEST_SUBTEXT}</p>
      </div>
      <form
        className="ex-request-form"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="ex-request-field-label">{EXERCISE}</div>
        <div className="ex-request-readonly">{exerciseName}</div>
        <label htmlFor="ex-req-note" className="ex-request-field-label">
          {NOTE_FOR_AI} <span className="ex-muted">{OPTIONAL}</span>
        </label>
        <input
          id="ex-req-note"
          className="ex-input"
          placeholder={NOTE_PLACEHOLDER}
          disabled
          readOnly
        />
        <button type="submit" className="ex-primary-btn ex-request-submit" disabled>
          {SUBMIT_REQUEST}
        </button>
        <label className="ex-concept-demo">
          <input type="checkbox" disabled />
          <span>
            <span className="ex-concept-demo-prefix">{CONCEPT_DEMO_PREFIX}</span>{" "}
            {CONCEPT_DEMO_TEXT}
          </span>
        </label>
      </form>
    </div>
  );
}
