import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fillPhysioAppRoutePattern,
  ROUTINE_SEARCH_QUERY_PARAM,
} from "../../app-routes.js";
import type {
  CommunityRoutineSummary,
  MyRoutineDraftItem,
  MyRoutineSavedItem,
  RoutineConditionOption,
} from "../../services/routines/types.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { useToast } from "../components/Toast.js";
import {
  ALL_ROUTINES_EMPTY_HEADING,
  ALL_ROUTINES_EMPTY_HELPER,
  BROWSE_ALL_ROUTINES,
  DRAFTS_SECTION,
  MY_ROUTINES_EMPTY_HEADING,
  MY_ROUTINES_EMPTY_HELPER,
  MY_ROUTINES_INTRO,
  ROUTINES_PAGE_TITLE,
  ROUTINES_TAB_ALL,
  ROUTINES_TAB_MY,
  SAVED_SECTION,
  SEARCH_ALL_PLACEHOLDER,
  SEARCH_ALL_WITH_CONDITIONS_PLACEHOLDER,
  SEARCH_MY_PLACEHOLDER,
  SEARCH_MY_ROUTINES_LABEL,
  SEARCH_ROUTINES_LABEL,
  allRoutinesIntro,
  flaggedBanner,
  toastSavedToMy,
} from "../copy/routines.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryListErrorSlot,
} from "../exercise-library/ExerciseLibraryStates.js";
import { RoutineListCard } from "./RoutineListCard.js";
import {
  DEFAULT_ROUTINE_FILTERS,
  routineFiltersToApiParams,
  type RoutineLibraryFilters,
  type RoutinesTab,
} from "./routine-library-filters.js";
import {
  RoutinesFiltersSortPanel,
  RoutinesSearchBar,
} from "./RoutinesFiltersSortPanel.js";

export type { RoutinesTab };

export function RoutinesPage() {
  const client = useRoutinesApi();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<RoutinesTab>("all");
  const [query, setQuery] = useState(
    searchParams.get(ROUTINE_SEARCH_QUERY_PARAM) ?? "",
  );
  const [filters, setFilters] = useState<RoutineLibraryFilters>(
    DEFAULT_ROUTINE_FILTERS,
  );
  const [community, setCommunity] = useState<CommunityRoutineSummary[]>([]);
  const [communityTotal, setCommunityTotal] = useState(0);
  const [drafts, setDrafts] = useState<MyRoutineDraftItem[]>([]);
  const [saved, setSaved] = useState<MyRoutineSavedItem[]>([]);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [conditionsAvailable, setConditionsAvailable] = useState(false);
  const [conditionOptions, setConditionOptions] = useState<RoutineConditionOption[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const filterParams = useMemo(() => routineFiltersToApiParams(filters), [filters]);
  const trimmedQuery = query.trim();

  const reload = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    const apiParams = {
      q: trimmedQuery || undefined,
      ...filterParams,
    };
    const task =
      tab === "all"
        ? client.searchCommunity(apiParams)
        : client.listMyRoutines(apiParams);
    void task
      .then((result) => {
        if (tab === "all" && "routines" in result) {
          setCommunity(result.routines);
          setCommunityTotal(result.total_count);
          setConditionsAvailable(result.conditions_available);
          setConditionOptions(result.condition_options);
        } else if ("saved" in result) {
          setDrafts(result.drafts);
          setSaved(result.saved);
          setFlaggedCount(result.flagged_count);
          setConditionsAvailable(result.conditions_available);
          setConditionOptions(result.condition_options);
        }
      })
      .catch(() => {
        setLoadFailed(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [client, tab, trimmedQuery, filterParams]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) {
      next.set(ROUTINE_SEARCH_QUERY_PARAM, value);
    } else {
      next.delete(ROUTINE_SEARCH_QUERY_PARAM);
    }
    setSearchParams(next, { replace: true });
  };

  const switchTab = (next: RoutinesTab) => {
    setTab(next);
  };

  const placeholder =
    tab === "mine"
      ? SEARCH_MY_PLACEHOLDER
      : conditionsAvailable
        ? SEARCH_ALL_WITH_CONDITIONS_PLACEHOLDER
        : SEARCH_ALL_PLACEHOLDER;

  const myCount = drafts.length + saved.length;
  const allCount = communityTotal || community.length;
  const listEmpty =
    !loading && !loadFailed && (tab === "all" ? community.length === 0 : myCount === 0);

  const showListContent = !loading && !loadFailed;

  const onSaveCommunity = (routineId: string, name: string) => {
    void client.saveToMyRoutines(routineId).then(({ undo }) => {
      showToast({
        message: toastSavedToMy(name),
        onUndo: () => {
          void client.applyUndo(routineId, undo).then(reload);
        },
      });
      reload();
    });
  };

  return (
    <section
      className="ex-page ex-library-page rt-library-page"
      aria-labelledby="routines-heading"
      data-testid="routines-page"
    >
      <h1 id="routines-heading" className="ex-page-title">
        {ROUTINES_PAGE_TITLE}
      </h1>

      <div className="ex-tabs" role="tablist" aria-label={ROUTINES_PAGE_TITLE}>
        <button
          type="button"
          role="tab"
          id="routines-tab-mine"
          aria-selected={tab === "mine"}
          aria-controls="routines-tabpanel"
          className={`ex-tab${tab === "mine" ? " ex-tab--active" : ""}`}
          onClick={() => {
            switchTab("mine");
          }}
        >
          {ROUTINES_TAB_MY}
          {myCount > 0 ? <span className="ex-tab-count">{myCount}</span> : null}
        </button>
        <button
          type="button"
          role="tab"
          id="routines-tab-all"
          aria-selected={tab === "all"}
          aria-controls="routines-tabpanel"
          className={`ex-tab${tab === "all" ? " ex-tab--active" : ""}`}
          onClick={() => {
            switchTab("all");
          }}
        >
          {ROUTINES_TAB_ALL}
          {allCount > 0 ? <span className="ex-tab-count">{allCount}</span> : null}
        </button>
      </div>

      <p className="ex-page-intro">
        {tab === "mine" ? MY_ROUTINES_INTRO : allRoutinesIntro(allCount)}
      </p>

      {tab === "mine" && flaggedCount > 0 ? (
        <p className="rt-flag-banner" role="status" data-testid="routines-flag-banner">
          {flaggedBanner(flaggedCount)}
        </p>
      ) : null}

      <div className="ex-search-sticky">
        <RoutinesSearchBar
          label={tab === "mine" ? SEARCH_MY_ROUTINES_LABEL : SEARCH_ROUTINES_LABEL}
          placeholder={placeholder}
          value={query}
          onChange={onQueryChange}
        />
      </div>

      <RoutinesFiltersSortPanel
        filters={filters}
        onChange={setFilters}
        conditionsAvailable={conditionsAvailable}
        conditionOptions={conditionOptions}
      />

      {loadFailed ? <ExerciseLibraryListErrorSlot /> : null}

      <div
        id="routines-tabpanel"
        role="tabpanel"
        aria-labelledby={tab === "mine" ? "routines-tab-mine" : "routines-tab-all"}
        className="rt-library-main"
        data-testid="routines-library-main"
        aria-busy={loading ? true : undefined}
      >
        {loading ? <ExerciseLibraryBusyState /> : null}

        {listEmpty ? (
          <div className="pg-empty" data-testid="routines-empty">
            <h2 className="pg-empty-title">
              {tab === "mine" ? MY_ROUTINES_EMPTY_HEADING : ALL_ROUTINES_EMPTY_HEADING}
            </h2>
            <p className="pg-empty-helper">
              {tab === "mine" ? MY_ROUTINES_EMPTY_HELPER : ALL_ROUTINES_EMPTY_HELPER}
            </p>
            {tab === "mine" ? (
              <button
                type="button"
                className="ex-secondary-btn"
                onClick={() => {
                  switchTab("all");
                }}
              >
                {BROWSE_ALL_ROUTINES}
              </button>
            ) : null}
          </div>
        ) : null}

        {showListContent && tab === "all" ? (
          <ul className="rt-card-grid" data-testid="routines-list">
            {community.map((item) => (
              <RoutineListCard
                key={item.routine_id}
                mode="all"
                item={item}
                conditionsAvailable={conditionsAvailable}
                onSave={() => {
                  if (item.in_my_routines) {
                    navigate(
                      fillPhysioAppRoutePattern("routineDetail", {
                        routineId: item.routine_id,
                      }),
                    );
                  } else {
                    onSaveCommunity(item.routine_id, item.name);
                  }
                }}
              />
            ))}
          </ul>
        ) : null}

        {showListContent && tab === "mine" && myCount > 0 ? (
          <div className="rt-sections">
            {drafts.length > 0 ? (
              <div>
                <h2 className="ex-section-title">{DRAFTS_SECTION}</h2>
                <ul className="rt-card-grid">
                  {drafts.map((item) => (
                    <RoutineListCard
                      key={item.routine_id}
                      mode="mine-draft"
                      item={item}
                      conditionsAvailable={conditionsAvailable}
                      onOpen={() => {
                        navigate(
                          fillPhysioAppRoutePattern("routineDetail", {
                            routineId: item.routine_id,
                          }),
                        );
                      }}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
            {saved.length > 0 ? (
              <div>
                {drafts.length > 0 ? (
                  <h2 className="ex-section-title">{SAVED_SECTION}</h2>
                ) : null}
                <ul className="rt-card-grid" data-testid="routines-list">
                  {saved.map((item) => (
                    <RoutineListCard
                      key={item.routine_id}
                      mode="mine-saved"
                      item={item}
                      conditionsAvailable={conditionsAvailable}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
