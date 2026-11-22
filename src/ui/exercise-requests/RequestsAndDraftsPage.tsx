import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { InProgressRequestListItem } from "../../services/exercise-requests/types.js";
import { useExerciseRequestsApi } from "../api/exercise-requests-context.js";
import { exerciseRequestsInProgressListKey } from "../api/navigation-read-cache-keys.js";
import { useExerciseRequestsRefresh } from "../api/exercise-requests-refresh-context.js";
import { useCurrentPractitionerIdentity } from "../api/practitioner-session-context.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
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
import { DeleteDraftButton } from "./DeleteDraftButton.js";
import { useToast } from "../components/Toast.js";
import { DELETE_DRAFT_TOAST_SUCCESS } from "../copy/delete-exercise-draft.js";

function reviewButtonLabel(
  item: InProgressRequestListItem,
  practitionerId: string,
  sessionIdentityReady: boolean,
): string {
  if (!sessionIdentityReady || practitionerId.length === 0) {
    return REVIEW_AND_APPROVE;
  }
  return item.requested_by === practitionerId ? REVIEW_DRAFT : REVIEW_AND_APPROVE;
}

function canReview(item: InProgressRequestListItem): boolean {
  return item.status === "drafting";
}

function listRowTag(item: InProgressRequestListItem): string {
  if (item.status === "open") {
    return AI_DRAFTING;
  }
  if (item.status === "drafting" && item.exercise_id === null) {
    return AI_DRAFTING;
  }
  return DRAFT_NOT_APPROVED;
}

export function RequestsAndDraftsPage() {
  const client = useExerciseRequestsApi();
  const { showToast } = useToast();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const currentPractitioner = useCurrentPractitionerIdentity();
  const sessionEpoch = useSessionReadCacheEpoch();
  const sessionState = usePractitionerSession();
  const sessionReady = sessionState.status === "ready";
  const { registerRequestsListFocusRefresh } = useExerciseRequestsRefresh();

  const listCacheKey = useMemo(
    () =>
      sessionReady && sessionEpoch
        ? exerciseRequestsInProgressListKey(sessionEpoch)
        : null,
    [sessionEpoch, sessionReady],
  );

  const {
    data: listData,
    loading: cacheLoading,
    loadFailed,
    refresh,
  } = useSessionCachedRead<{ requests: InProgressRequestListItem[] }>({
    cacheKey: listCacheKey,
    enabled: true,
    fetcher: (signal) =>
      client.listInProgress({ signal }).then((result) => ({
        requests: result.requests,
      })),
  });

  useEffect(() => {
    const focusRefresh = () => refresh({ force: true });
    registerRequestsListFocusRefresh(focusRefresh);
    return () => {
      registerRequestsListFocusRefresh(null);
    };
  }, [refresh, registerRequestsListFocusRefresh]);

  const loading = cacheLoading;
  const requests = listData?.requests ?? [];

  const sessionBusy =
    loading ||
    (requests.length > 0 &&
      currentPractitioner.sessionIdentityPending &&
      !currentPractitioner.sessionIdentityReady);

  return (
    <section
      className="ex-page"
      aria-labelledby="ex-requests-heading"
      aria-busy={sessionBusy ? true : undefined}
    >
      <h1
        id="ex-requests-heading"
        className="ex-page-title"
        ref={headingRef}
        tabIndex={-1}
      >
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
            const generationInProgress = item.generation_in_progress;
            const by = requestedByLabel({
              requestedBy: item.requested_by,
              requestedByEmail: item.requested_by_email,
              currentPractitionerId: currentPractitioner.practitionerId,
              currentDisplayName: currentPractitioner.displayName,
              sessionIdentityReady: currentPractitioner.sessionIdentityReady,
            });
            return (
              <li key={item.request_id} className="ex-requests-row">
                <div className="ex-requests-row-body">
                  <h2 className="ex-requests-row-title">{title}</h2>
                  <div className="ex-requests-row-tags">
                    <span
                      className={
                        listRowTag(item) === AI_DRAFTING
                          ? "ex-tag ex-tag--drafting"
                          : "ex-tag ex-tag--draft"
                      }
                    >
                      {listRowTag(item)}
                    </span>
                  </div>
                  {by.length > 0 ? (
                    <p className="ex-requests-row-meta">
                      {REQUESTED_BY} <span className="ex-requests-row-by">{by}</span>
                    </p>
                  ) : null}
                  {item.exercise_note ? (
                    <p className="ex-requests-row-note">{item.exercise_note}</p>
                  ) : null}
                </div>
                <div className="ex-requests-row-actions">
                  {canReview(item) ? (
                    <Link
                      to={fillPhysioAppRoutePattern("requestReview", {
                        requestId: item.request_id,
                      })}
                      className="ex-primary-btn ex-requests-review-link"
                      data-testid={`ex-requests-review-${item.request_id}`}
                    >
                      {reviewButtonLabel(
                        item,
                        currentPractitioner.practitionerId,
                        currentPractitioner.sessionIdentityReady,
                      )}
                    </Link>
                  ) : (
                    <p className="ex-requests-wait">{USUALLY_READY}</p>
                  )}
                  <DeleteDraftButton
                    listRow
                    requestId={item.request_id}
                    title={title}
                    generationInProgress={generationInProgress}
                    onGenerationBlocked={() => {
                      void refresh({ force: true });
                    }}
                    onSuccess={() => {
                      const deletedIndex = requests.findIndex(
                        (r) => r.request_id === item.request_id,
                      );
                      showToast({ message: DELETE_DRAFT_TOAST_SUCCESS });
                      void refresh({ force: true }).then(() => {
                        const reviewLinks = [
                          ...document.querySelectorAll<HTMLElement>(
                            '[data-testid^="ex-requests-review-"]',
                          ),
                        ];
                        if (reviewLinks.length === 0) {
                          headingRef.current?.focus();
                          return;
                        }
                        const focusIndex =
                          deletedIndex >= 0 && deletedIndex < reviewLinks.length
                            ? deletedIndex
                            : Math.max(0, reviewLinks.length - 1);
                        reviewLinks[focusIndex]?.focus();
                      });
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
