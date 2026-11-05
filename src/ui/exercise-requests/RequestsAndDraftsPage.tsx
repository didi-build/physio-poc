import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { InProgressRequestListItem } from "../../services/exercise-requests/types.js";
import { DEV_PRACTITIONER_ID } from "../api/exercise-library-client.js";
import { useExerciseRequestsApi } from "../api/exercise-requests-context.js";
import { EXERCISE_REQUESTS_LIST_ERROR_MESSAGE } from "../copy/exercise-requests-states.js";
import {
  AI_DRAFTING,
  DRAFT_NOT_APPROVED,
  REQUESTED_BY,
  REQUESTS_EMPTY,
  REQUESTS_HEADING,
  REQUESTS_INTRO,
  REQUESTS_SHARED_HINT,
  REVIEW_AND_APPROVE,
  REVIEW_DRAFT,
  USUALLY_READY,
} from "../copy/exercise-requests.js";
import { requestedByLabel } from "./requested-by-label.js";

function reviewButtonLabel(item: InProgressRequestListItem): string {
  return item.requested_by === DEV_PRACTITIONER_ID ? REVIEW_DRAFT : REVIEW_AND_APPROVE;
}

function canReview(item: InProgressRequestListItem): boolean {
  return item.status === "drafting" && item.exercise_id !== null;
}

export type RequestsAndDraftsPageProps = {
  onRequestsChanged?: () => void;
};

export function RequestsAndDraftsPage({
  onRequestsChanged,
}: RequestsAndDraftsPageProps) {
  const client = useExerciseRequestsApi();
  const [requests, setRequests] = useState<InProgressRequestListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const result = await client.listInProgress();
      setRequests(result.requests);
      onRequestsChanged?.();
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [client, onRequestsChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section
      className="ex-page"
      aria-labelledby="ex-requests-heading"
      aria-busy={loading ? true : undefined}
    >
      <h1 id="ex-requests-heading" className="ex-page-title">
        {REQUESTS_HEADING}
      </h1>
      <p className="ex-page-intro">{REQUESTS_INTRO}</p>
      <p className="ex-requests-shared">{REQUESTS_SHARED_HINT}</p>

      {loadFailed ? (
        <div data-testid="exercise-requests-list-error-slot" className="ex-error-slot">
          {EXERCISE_REQUESTS_LIST_ERROR_MESSAGE}
        </div>
      ) : null}

      {!loading && !loadFailed && requests.length === 0 ? (
        <p className="ex-requests-empty">{REQUESTS_EMPTY}</p>
      ) : null}

      {!loading && !loadFailed && requests.length > 0 ? (
        <ul className="ex-requests-list">
          {requests.map((item) => {
            const title = item.draft_title ?? item.requested_name;
            const by = requestedByLabel({
              requestedBy: item.requested_by,
              requestedByEmail: item.requested_by_email,
            });
            return (
              <li key={item.request_id} className="ex-requests-row">
                <div className="ex-requests-row-body">
                  <h2 className="ex-requests-row-title">{title}</h2>
                  <div className="ex-requests-row-tags">
                    {item.status === "open" ? (
                      <span className="ex-tag ex-tag--drafting">{AI_DRAFTING}</span>
                    ) : (
                      <span className="ex-tag ex-tag--draft">{DRAFT_NOT_APPROVED}</span>
                    )}
                  </div>
                  <p className="ex-requests-row-meta">
                    {REQUESTED_BY} <span className="ex-requests-row-by">{by}</span>
                  </p>
                  {item.exercise_note ? (
                    <p className="ex-requests-row-note">{item.exercise_note}</p>
                  ) : null}
                </div>
                {canReview(item) ? (
                  <Link
                    to={fillPhysioAppRoutePattern("requestReview", {
                      requestId: item.request_id,
                    })}
                    className="ex-primary-btn ex-requests-review-link"
                  >
                    {reviewButtonLabel(item)}
                  </Link>
                ) : (
                  <p className="ex-requests-wait">{USUALLY_READY}</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
