import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  fillPhysioAppRoutePattern,
  physioAppExerciseSearchPath,
} from "../../app-routes.js";
import type {
  ApprovedExerciseSummary,
  MyExerciseListItem,
} from "../../services/exercise-library/types.js";
import type { DraftInProgressSummary } from "../../services/exercise-requests/types.js";
import { useExerciseRequestsApi } from "../api/exercise-requests-context.js";
import { useExerciseRequestsRefresh } from "../api/exercise-requests-refresh-context.js";
import { useCurrentPractitionerIdentity } from "../api/practitioner-session-context.js";
import { useToast } from "../components/Toast.js";
import {
  allExercisesIntro,
  BROWSE_ALL,
  BACK_LIBRARY,
  IN_LIBRARY,
  LIB_HEADING,
  LIB_MY_DESCRIPTION,
  LIB_TAB_ALL,
  LIB_TAB_MY,
  MATCHED_ALIAS_PREFIX,
  noExactMatchHeading,
  NOT_IN_LIBRARY_YET,
  SEARCH_ALL_EXERCISES,
  SEARCH_ALL_PLACEHOLDER,
  SEARCH_LABEL,
  SEARCH_MY_PLACEHOLDER,
  SECTION_NEW_FROM_REQUESTS,
  SECTION_PINNED,
  SECTION_RECENT,
  SIMILAR_INTRO,
  SIMILAR_SECTION,
  TOAST_SAVED_MY,
  TRY_ALL_OR_REQUEST,
  USE_THIS,
  usingExerciseToast,
  NO_SAVED_WITH_FILTERS,
  nothingInMyMatches,
} from "../copy/exercise-library.js";
import {
  AI_DRAFTING,
  REQUESTED_BY,
  TAG_DRAFT,
  VIEW_DRAFT,
} from "../copy/exercise-requests.js";
import { TOAST_UNDO } from "../copy/nav.js";
import { ExerciseListCard, type ExerciseCardModel } from "./ExerciseListCard.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryListErrorSlot,
} from "./ExerciseLibraryStates.js";
import { FiltersSortPanel, LibrarySearchBar } from "./FiltersSortPanel.js";
import {
  DEFAULT_FILTERS,
  filtersToApiParams,
  hasExactTitleMatch,
  type LibraryFilters,
  type LibraryTab,
} from "./library-filters.js";
import {
  RequestForm,
  RequestSubmittedPanel,
} from "../exercise-requests/RequestForm.js";
import { requestedByLabel } from "../exercise-requests/requested-by-label.js";
import { useExerciseLibraryApi } from "../api/exercise-library-context.js";

function flattenMySections(sections: {
  new_from_requests: MyExerciseListItem[];
  pinned: MyExerciseListItem[];
  recently_used_and_saved: MyExerciseListItem[];
}): MyExerciseListItem[] {
  return [
    ...sections.new_from_requests,
    ...sections.pinned,
    ...sections.recently_used_and_saved,
  ];
}

function myItemToCard(item: MyExerciseListItem): ExerciseCardModel {
  return {
    exercise_id: item.exercise_id,
    exercise_name: item.exercise_name,
    category: item.category,
    body_regions: item.body_regions,
    matched_alias: item.matched_alias,
    edited: item.edited,
    library_updated: item.library_updated,
    favourite: item.favourite,
    saved_at: item.saved_at,
    last_used_at: item.last_used_at,
    is_new: item.section === "new_from_requests",
  };
}

function approvedToCard(
  item: ApprovedExerciseSummary,
  inMy: Set<string>,
): ExerciseCardModel {
  return {
    exercise_id: item.exercise_id,
    exercise_name: item.exercise_name,
    category: item.category,
    body_regions: item.body_regions,
    matched_alias: item.matched_alias,
    usage_count: item.usage_count,
    in_my_exercises: inMy.has(item.exercise_id),
  };
}

export type ExerciseLibraryPageProps = {
  initialTab: LibraryTab;
  onRequestsChanged?: () => void;
};

export function ExerciseLibraryPage({
  initialTab,
  onRequestsChanged,
}: ExerciseLibraryPageProps) {
  const client = useExerciseLibraryApi();
  const requestsClient = useExerciseRequestsApi();
  const currentPractitioner = useCurrentPractitionerIdentity();
  const { refreshInProgressCount } = useExerciseRequestsRefresh();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [mySections, setMySections] = useState<{
    new_from_requests: MyExerciseListItem[];
    pinned: MyExerciseListItem[];
    recently_used_and_saved: MyExerciseListItem[];
  }>({ new_from_requests: [], pinned: [], recently_used_and_saved: [] });
  const [myListState, setMyListState] = useState<
    "ok" | "no_saved_exercises_with_filters" | "nothing_in_my_exercises_matches"
  >("ok");
  const [mySearchQuery, setMySearchQuery] = useState<string | undefined>();
  const [allExercises, setAllExercises] = useState<ApprovedExerciseSummary[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [myIds, setMyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [similarDrafts, setSimilarDrafts] = useState<DraftInProgressSummary[]>([]);
  const [reqNote, setReqNote] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [submittedRequestName, setSubmittedRequestName] = useState<string | null>(null);
  const formOpenedAtRef = useRef<string>(new Date().toISOString());
  const location = useLocation();

  const apiFilterParams = useMemo(() => filtersToApiParams(filters), [filters]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const trimmed = query.trim();
      if (tab === "mine") {
        const result = await client.listMyExercises({
          q: trimmed || undefined,
          category: apiFilterParams.category,
          body_region: apiFilterParams.body_region,
        });
        setMySections(result.sections);
        setMyListState(result.list_state);
        setMySearchQuery(result.search_query);
        const ids = new Set(
          flattenMySections(result.sections).map((item) => item.exercise_id),
        );
        setMyIds(ids);
      } else {
        const [listResult, searchResult] = await Promise.all([
          client.listMyExercises(),
          client.searchApproved({
            q: trimmed || undefined,
            ...apiFilterParams,
            limit: 25,
          }),
        ]);
        setAllExercises(searchResult.exercises);
        setAllTotal(searchResult.total_count);
        const ids = new Set(
          flattenMySections(listResult.sections).map((item) => item.exercise_id),
        );
        setMyIds(ids);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [apiFilterParams, client, query, tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setQuery(q);
    if (q.trim()) {
      formOpenedAtRef.current = new Date().toISOString();
      setSubmittedRequestName(null);
    }
  }, [searchParams]);

  useEffect(() => {
    const resume = (location.state as { resumeNote?: string } | null)?.resumeNote;
    if (typeof resume === "string") {
      setReqNote(resume);
    }
  }, [location.state]);

  const myCount = useMemo(
    () =>
      mySections.new_from_requests.length +
      mySections.pinned.length +
      mySections.recently_used_and_saved.length,
    [mySections],
  );

  const trimmedQuery = query.trim();
  const exactMatch = hasExactTitleMatch(
    trimmedQuery,
    allExercises.map((item) => item.exercise_name),
  );
  const showNoExactMatch = tab === "all" && trimmedQuery.length > 0 && !exactMatch;

  useEffect(() => {
    if (!showNoExactMatch || loadFailed) {
      setSimilarDrafts([]);
      return;
    }
    let cancelled = false;
    void requestsClient.listSimilar(trimmedQuery).then(
      (result) => {
        if (!cancelled) {
          setSimilarDrafts(result.drafts_in_progress);
        }
      },
      () => {
        if (!cancelled) {
          setSimilarDrafts([]);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadFailed, requestsClient, showNoExactMatch, trimmedQuery]);

  const handleSave = async (exerciseId: string) => {
    const { undo } = await client.saveToMyExercises(exerciseId);
    showToast({
      message: TOAST_SAVED_MY,
      onUndo: () => {
        void client.applyUndo(exerciseId, undo).then(() => reload());
      },
    });
    await reload();
  };

  const switchTab = (next: LibraryTab) => {
    setTab(next);
    if (next === "all" && trimmedQuery) {
      navigate(physioAppExerciseSearchPath(trimmedQuery));
    } else if (next === "mine") {
      navigate(fillPhysioAppRoutePattern("exercises"));
    }
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (tab === "all") {
      formOpenedAtRef.current = new Date().toISOString();
      setSubmittedRequestName(null);
      if (value.trim()) {
        setSearchParams({ q: value.trim() });
      } else {
        setSearchParams({});
      }
    }
  };

  const submitRequest = async () => {
    if (!trimmedQuery || submittingRequest) {
      return;
    }
    setSubmittingRequest(true);
    try {
      const result = await requestsClient.submitRequest({
        requested_name: trimmedQuery,
        exercise_note: reqNote.trim() || null,
        form_opened_at: formOpenedAtRef.current,
        resolution: "submit",
      });
      if (result.outcome === "conflict") {
        navigate(fillPhysioAppRoutePattern("requestConflict"), {
          state: {
            pending: result.pending,
            similar_request: result.similar_request,
            form_opened_at: formOpenedAtRef.current,
          },
        });
        return;
      }
      if (result.outcome === "created") {
        setSubmittedRequestName(trimmedQuery);
        onRequestsChanged?.();
        void refreshInProgressCount();
      }
    } finally {
      setSubmittingRequest(false);
    }
  };

  const hasSimilar = allExercises.length > 0 || similarDrafts.length > 0;

  const showListContent = !loading && !loadFailed;

  return (
    <section className="ex-page" aria-labelledby="ex-lib-heading">
      {loadFailed ? (
        <Link to={fillPhysioAppRoutePattern("exercises")} className="ex-back-link">
          {BACK_LIBRARY}
        </Link>
      ) : null}
      <h1 id="ex-lib-heading" className="ex-page-title">
        {LIB_HEADING}
      </h1>
      <div className="ex-tabs" role="tablist" aria-label="Library">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          className={`ex-tab${tab === "mine" ? " ex-tab--active" : ""}`}
          onClick={() => {
            switchTab("mine");
          }}
        >
          {LIB_TAB_MY}
          {myCount > 0 ? <span className="ex-tab-count">{myCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={`ex-tab${tab === "all" ? " ex-tab--active" : ""}`}
          onClick={() => {
            switchTab("all");
          }}
        >
          {LIB_TAB_ALL}
          {allTotal > 0 ? <span className="ex-tab-count">{allTotal}</span> : null}
        </button>
      </div>
      <p className="ex-page-intro">
        {tab === "mine"
          ? LIB_MY_DESCRIPTION
          : allExercisesIntro(allTotal || allExercises.length)}
      </p>

      <div className="ex-search-sticky">
        <LibrarySearchBar
          label={SEARCH_LABEL}
          placeholder={tab === "mine" ? SEARCH_MY_PLACEHOLDER : SEARCH_ALL_PLACEHOLDER}
          value={query}
          onChange={onQueryChange}
        />
      </div>
      <FiltersSortPanel filters={filters} onChange={setFilters} />

      {loadFailed ? <ExerciseLibraryListErrorSlot /> : null}

      <div
        className="ex-library-main"
        data-testid="exercise-library-main"
        aria-busy={loading ? true : undefined}
      >
        {loading ? <ExerciseLibraryBusyState /> : null}

        {showListContent && tab === "mine" ? (
          myListState === "nothing_in_my_exercises_matches" && mySearchQuery ? (
            <div className="ex-empty">
              <h2>{nothingInMyMatches(mySearchQuery)}</h2>
              <p>{TRY_ALL_OR_REQUEST}</p>
              <button
                type="button"
                className="ex-primary-btn"
                onClick={() => {
                  switchTab("all");
                }}
              >
                {SEARCH_ALL_EXERCISES}
              </button>
            </div>
          ) : myCount === 0 ? (
            <div className="ex-empty">
              <h2>
                {myListState === "no_saved_exercises_with_filters"
                  ? NO_SAVED_WITH_FILTERS
                  : NO_SAVED_WITH_FILTERS}
              </h2>
              <p>{TRY_ALL_OR_REQUEST}</p>
              <button
                type="button"
                className="ex-primary-btn"
                onClick={() => {
                  switchTab("all");
                }}
              >
                {SEARCH_ALL_EXERCISES}
              </button>
            </div>
          ) : (
            <div className="ex-sections">
              {mySections.new_from_requests.length > 0 ? (
                <div>
                  <h2 className="ex-section-title">{SECTION_NEW_FROM_REQUESTS}</h2>
                  <ul className="ex-card-grid">
                    {mySections.new_from_requests.map((item) => (
                      <ExerciseListCard
                        key={item.exercise_id}
                        mode="mine"
                        item={myItemToCard(item)}
                        onTogglePin={() => {
                          void client
                            .setPinned(item.exercise_id, !item.favourite)
                            .then(() => reload());
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {mySections.pinned.length > 0 ? (
                <div>
                  <h2 className="ex-section-title">{SECTION_PINNED}</h2>
                  <ul className="ex-card-grid">
                    {mySections.pinned.map((item) => (
                      <ExerciseListCard
                        key={item.exercise_id}
                        mode="mine"
                        item={myItemToCard(item)}
                        onTogglePin={() => {
                          void client
                            .setPinned(item.exercise_id, !item.favourite)
                            .then(() => reload());
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              {mySections.recently_used_and_saved.length > 0 ? (
                <div>
                  <h2 className="ex-section-title">{SECTION_RECENT}</h2>
                  <ul className="ex-card-grid">
                    {mySections.recently_used_and_saved.map((item) => (
                      <ExerciseListCard
                        key={item.exercise_id}
                        mode="mine"
                        item={myItemToCard(item)}
                        onTogglePin={() => {
                          void client
                            .setPinned(item.exercise_id, !item.favourite)
                            .then(() => reload());
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                type="button"
                className="ex-secondary-btn"
                onClick={() => {
                  switchTab("all");
                }}
              >
                {BROWSE_ALL}
              </button>
            </div>
          )
        ) : null}

        {showListContent && tab === "all" ? (
          <>
            {showNoExactMatch ? (
              <div className="ex-no-exact">
                <h2>{noExactMatchHeading(trimmedQuery)}</h2>
                <p>{hasSimilar ? SIMILAR_INTRO : NOT_IN_LIBRARY_YET}</p>
              </div>
            ) : null}
            {!showNoExactMatch && allExercises.length > 0 ? (
              <ul className="ex-card-grid ex-card-grid--spaced">
                {allExercises.map((item) => (
                  <ExerciseListCard
                    key={item.exercise_id}
                    mode="all"
                    item={approvedToCard(item, myIds)}
                    onSave={() => {
                      void handleSave(item.exercise_id);
                    }}
                  />
                ))}
              </ul>
            ) : null}
            {showNoExactMatch && hasSimilar ? (
              <section aria-labelledby="ex-similar-heading">
                <h2 id="ex-similar-heading" className="ex-section-title">
                  {SIMILAR_SECTION}
                </h2>
                <ul className="ex-similar-list">
                  {allExercises.map((item) => (
                    <li key={item.exercise_id} className="ex-similar-row">
                      <div className="ex-similar-body">
                        <span className="ex-similar-name">{item.exercise_name}</span>
                        <span className="ex-tag ex-tag--library">{IN_LIBRARY}</span>
                        {item.matched_alias ? (
                          <span className="ex-card-alias">
                            {MATCHED_ALIAS_PREFIX} {item.matched_alias}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="ex-secondary-btn"
                        onClick={() => {
                          void handleSave(item.exercise_id).then(() => {
                            showToast({
                              message: usingExerciseToast(item.exercise_name),
                            });
                            navigate(
                              fillPhysioAppRoutePattern("exerciseDetail", {
                                exerciseId: item.exercise_id,
                              }),
                            );
                          });
                        }}
                      >
                        {USE_THIS}
                      </button>
                    </li>
                  ))}
                  {similarDrafts.map((draft) => {
                    const name = draft.draft_title ?? draft.requested_name;
                    const by = requestedByLabel({
                      requestedBy: draft.requested_by,
                      requestedByEmail: draft.requested_by_email,
                      currentPractitionerId: currentPractitioner.practitionerId,
                      currentDisplayName: currentPractitioner.displayName,
                      sessionIdentityReady: currentPractitioner.sessionIdentityReady,
                    });
                    return (
                      <li key={draft.request_id} className="ex-similar-row">
                        <div className="ex-similar-body">
                          <span className="ex-similar-name">{name}</span>
                          <span className="ex-tag ex-tag--draft">{TAG_DRAFT}</span>
                          <span className="ex-similar-meta">
                            {by.length > 0 ? `${REQUESTED_BY} ${by}, ` : ""}
                            {AI_DRAFTING}
                          </span>
                        </div>
                        <Link
                          to={fillPhysioAppRoutePattern("requestReview", {
                            requestId: draft.request_id,
                          })}
                          className="ex-secondary-btn ex-similar-link"
                        >
                          {VIEW_DRAFT}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            {showNoExactMatch ? (
              <div className="ex-request-shell">
                {submittedRequestName ? (
                  <RequestSubmittedPanel
                    exerciseName={submittedRequestName}
                    onViewRequest={() => {
                      navigate(fillPhysioAppRoutePattern("requests"));
                    }}
                  />
                ) : (
                  <RequestForm
                    exerciseName={trimmedQuery}
                    showNoneHeading={hasSimilar}
                    note={reqNote}
                    onNoteChange={setReqNote}
                    onSubmit={() => {
                      void submitRequest();
                    }}
                    submitting={submittingRequest}
                  />
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <span className="sr-only">{TOAST_UNDO}</span>
    </section>
  );
}
