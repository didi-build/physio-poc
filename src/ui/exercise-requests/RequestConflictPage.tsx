import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  fillPhysioAppRoutePattern,
  physioAppExerciseSearchPath,
} from "../../app-routes.js";
import type { ConflictSimilarRequest } from "../../services/exercise-requests/types.js";
import { useExerciseRequestsApi } from "../api/exercise-requests-context.js";
import { useToast } from "../components/Toast.js";
import { USE_THIS } from "../copy/exercise-library.js";
import {
  AI_DRAFTING,
  BACK_TO_EDIT,
  BACK_TO_REQUEST,
  CONFLICT_HEADING,
  CONFLICT_STATUS,
  MERGE_MY_CHANGES,
  MERGE_MY_CHANGES_HINT,
  NEW_EXERCISE_REQUEST,
  NOTE_PREFIX,
  SUBMITTED_WHILE_ADDING,
  SUBMIT_ANYWAY,
  TAG_DRAFT,
  YOUR_REQUEST,
  toastMergedIntoDraft,
  toastUsingExisting,
} from "../copy/exercise-requests.js";

export type RequestConflictLocationState = {
  pending: {
    requested_name: string;
    exercise_note: string | null;
  };
  similar_request: ConflictSimilarRequest;
  form_opened_at: string;
};

export function RequestConflictPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const client = useExerciseRequestsApi();
  const { showToast } = useToast();
  const state = location.state as RequestConflictLocationState | null;

  if (!state?.pending || !state.similar_request) {
    return (
      <section className="ex-page">
        <Link to={fillPhysioAppRoutePattern("exerciseSearch")} className="ex-back-link">
          {BACK_TO_REQUEST}
        </Link>
      </section>
    );
  }

  const { pending, similar_request: conflict, form_opened_at } = state;
  const displayName = conflict.draft_title ?? conflict.requested_name;

  const resolve = async (resolution: "use_existing" | "merge" | "submit_anyway") => {
    const result = await client.submitRequest({
      requested_name: pending.requested_name,
      exercise_note: pending.exercise_note,
      form_opened_at,
      resolution,
      conflict_request_id: conflict.request_id,
    });
    if (result.outcome === "used_existing") {
      showToast({ message: toastUsingExisting(displayName) });
      navigate(fillPhysioAppRoutePattern("requests"));
      return;
    }
    if (result.outcome === "merged") {
      showToast({ message: toastMergedIntoDraft(displayName) });
      navigate(fillPhysioAppRoutePattern("requests"));
      return;
    }
    if (result.outcome === "created") {
      navigate(fillPhysioAppRoutePattern("requests"));
    }
  };

  return (
    <section className="ex-page" aria-labelledby="ex-conflict-heading">
      <Link
        to={physioAppExerciseSearchPath(pending.requested_name)}
        className="ex-back-link"
      >
        {BACK_TO_REQUEST}
      </Link>
      <p className="ex-kicker">{NEW_EXERCISE_REQUEST}</p>
      <h1 id="ex-conflict-heading" className="ex-page-title">
        {CONFLICT_HEADING}
      </h1>
      <div className="ex-conflict-alert" role="status">
        <p>{CONFLICT_STATUS}</p>
      </div>
      <div className="ex-conflict-card">
        <h2 className="ex-section-title">{YOUR_REQUEST}</h2>
        <p className="ex-conflict-name">{pending.requested_name}</p>
        {pending.exercise_note ? (
          <p className="ex-conflict-note">
            {NOTE_PREFIX} {pending.exercise_note}
          </p>
        ) : null}
      </div>
      <h2 className="ex-section-title">{SUBMITTED_WHILE_ADDING}</h2>
      <ul className="ex-conflict-list">
        <li className="ex-conflict-item">
          <div className="ex-conflict-item-body">
            <span className="ex-similar-name">{displayName}</span>
            <span className="ex-tag ex-tag--draft">{TAG_DRAFT}</span>
            <p className="ex-conflict-meta">{AI_DRAFTING}</p>
          </div>
          <div className="ex-conflict-actions">
            <button
              type="button"
              className="ex-secondary-btn"
              onClick={() => {
                void resolve("use_existing");
              }}
            >
              {USE_THIS}
            </button>
            <button
              type="button"
              className="ex-primary-btn"
              onClick={() => {
                void resolve("merge");
              }}
            >
              {MERGE_MY_CHANGES}
            </button>
          </div>
        </li>
      </ul>
      <p className="ex-conflict-hint">{MERGE_MY_CHANGES_HINT}</p>
      <div className="ex-conflict-footer">
        <button
          type="button"
          className="ex-secondary-btn"
          onClick={() => {
            void resolve("submit_anyway");
          }}
        >
          {SUBMIT_ANYWAY}
        </button>
        <button
          type="button"
          className="ex-ghost-btn"
          onClick={() => {
            navigate(physioAppExerciseSearchPath(pending.requested_name), {
              state: { resumeNote: pending.exercise_note },
            });
          }}
        >
          {BACK_TO_EDIT}
        </button>
      </div>
    </section>
  );
}
