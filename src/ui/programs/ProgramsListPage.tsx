import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { ProgramListItem } from "../../services/programs/types.js";
import { useProgramsApi } from "../api/programs-context.js";
import { useToast } from "../components/Toast.js";
import {
  CLEAR_SEARCH,
  NEW_PROGRAM,
  PROGRAMS_EMPTY_HEADING,
  PROGRAMS_EMPTY_HELPER,
  PROGRAMS_INTRO,
  PROGRAMS_PAGE_TITLE,
  RECENTLY_DELETED,
  RECENTLY_DELETED_EMPTY,
  RECENTLY_DELETED_INTRO,
  RESTORE,
  SEARCH_BY_NAME_OR_CODE,
  SEARCH_PROGRAMS_HELPER,
  SEARCH_PROGRAMS_LABEL,
  UNTITLED_PROGRAM,
  cardExerciseCountLine,
  listCountLabel,
  programCodeChipLabel,
  programsSearchNoMatch,
  restoredProgramToast,
} from "../copy/programs.js";
import { ProgramListCard } from "./ProgramListCard.js";
import { NewProgramSheet } from "./NewProgramSheet.js";
import { ProgramsListBusyState, ProgramsListErrorSlot } from "./ProgramsStates.js";

export function ProgramsListPage() {
  const client = useProgramsApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const [items, setItems] = useState<ProgramListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [matchedCode, setMatchedCode] = useState<string | null>(null);
  const [deletedItems, setDeletedItems] = useState<ProgramListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const query = searchParams.get("q") ?? "";
  const trimmedQuery = query.trim();

  const load = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    const listPromise =
      trimmedQuery.length > 0
        ? Promise.all([client.listPrograms(trimmedQuery), client.listPrograms()]).then(
            ([filtered, all]) => ({
              items: filtered.items,
              matched_code: filtered.matched_code,
              totalCount: all.items.length,
            }),
          )
        : client.listPrograms().then((result) => ({
            items: result.items,
            matched_code: result.matched_code,
            totalCount: result.items.length,
          }));

    void Promise.all([listPromise, client.listDeletedPrograms()])
      .then(([listResult, deletedResult]) => {
        setItems(listResult.items);
        setMatchedCode(listResult.matched_code);
        setTotalCount(listResult.totalCount);
        setDeletedItems(deletedResult.items);
      })
      .catch(() => {
        setLoadFailed(true);
        setItems([]);
        setTotalCount(0);
        setDeletedItems([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [client, trimmedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setNewSheetOpen(true);
    }
  }, [searchParams]);

  const countLabel = useMemo(
    () =>
      trimmedQuery.length > 0
        ? listCountLabel(totalCount, items.length)
        : listCountLabel(totalCount),
    [items.length, totalCount, trimmedQuery.length],
  );

  const showEmpty =
    !loading && !loadFailed && totalCount === 0 && trimmedQuery.length === 0;
  const showNoMatch =
    !loading && !loadFailed && trimmedQuery.length > 0 && items.length === 0;

  const openNewSheet = () => {
    setNewSheetOpen(true);
  };

  const createFromScratch = () => {
    const programId = crypto.randomUUID();
    setNewSheetOpen(false);
    void client
      .createProgram({ program_id: programId })
      .then((result) => {
        navigate(
          fillPhysioAppRoutePattern("programBuilder", {
            programCode: result.program.code,
          }),
        );
      })
      .catch(() => {
        setLoadFailed(true);
      });
  };

  const onRestore = (item: ProgramListItem) => {
    setRestoringId(item.program_id);
    void client
      .restoreProgram(item.program_id)
      .then((result) => {
        showToast({ message: restoredProgramToast(result.program.name) });
        load();
      })
      .catch(() => {
        /* leave list unchanged */
      })
      .finally(() => {
        setRestoringId(null);
      });
  };

  return (
    <section
      className="pg-page ex-page"
      aria-labelledby="programs-heading"
      aria-busy={loading || restoringId !== null ? true : undefined}
    >
      <header className="pg-page-header">
        <h1 id="programs-heading" className="ex-page-title">
          {PROGRAMS_PAGE_TITLE}
        </h1>
        <button type="button" className="pg-btn pg-btn--primary" onClick={openNewSheet}>
          {NEW_PROGRAM}
        </button>
      </header>
      <p className="ex-page-intro">{PROGRAMS_INTRO}</p>

      {!showEmpty ? (
        <>
          <label className="pg-search-label">
            <span className="pg-search-label-text">{SEARCH_BY_NAME_OR_CODE}</span>
            <input
              type="search"
              className="pg-search-input"
              aria-label={SEARCH_PROGRAMS_LABEL}
              value={query}
              onChange={(event) => {
                const value = event.target.value;
                if (value.trim().length === 0) {
                  setSearchParams({});
                } else {
                  setSearchParams({ q: value });
                }
              }}
            />
          </label>
          <p className="pg-search-helper">{SEARCH_PROGRAMS_HELPER}</p>
          {countLabel ? (
            <p className="pg-list-count" aria-live="polite">
              {countLabel}
            </p>
          ) : null}
        </>
      ) : null}

      {loading ? <ProgramsListBusyState /> : null}
      {loadFailed ? <ProgramsListErrorSlot /> : null}

      {showEmpty ? (
        <div className="pg-empty">
          <h2 className="pg-empty-title">{PROGRAMS_EMPTY_HEADING}</h2>
          <p className="pg-empty-helper">{PROGRAMS_EMPTY_HELPER}</p>
          <button
            type="button"
            className="pg-btn pg-btn--primary"
            onClick={openNewSheet}
          >
            {NEW_PROGRAM}
          </button>
        </div>
      ) : null}

      {showNoMatch ? (
        <div className="pg-no-match">
          <p>{programsSearchNoMatch(query)}</p>
          <button
            type="button"
            className="pg-btn pg-btn--secondary"
            onClick={() => {
              setSearchParams({});
            }}
          >
            {CLEAR_SEARCH}
          </button>
        </div>
      ) : null}

      {!loading && !loadFailed && items.length > 0 ? (
        <ul className="pg-card-list">
          {items.map((item) => (
            <li key={item.program_id}>
              <ProgramListCard item={item} matchedCode={matchedCode} />
            </li>
          ))}
        </ul>
      ) : null}

      <section className="pg-deleted" aria-labelledby="pg-deleted-heading">
        <h2 id="pg-deleted-heading" className="pg-deleted-title">
          {RECENTLY_DELETED}
        </h2>
        <p className="pg-deleted-intro">{RECENTLY_DELETED_INTRO}</p>
        {deletedItems.length === 0 ? (
          <p className="pg-deleted-empty">{RECENTLY_DELETED_EMPTY}</p>
        ) : (
          <ul className="pg-deleted-list">
            {deletedItems.map((item) => (
              <li key={item.program_id} className="pg-deleted-item">
                <div className="pg-deleted-item-main">
                  <span className="pg-deleted-item-name">
                    {item.name?.trim() ? item.name : UNTITLED_PROGRAM}
                  </span>
                  <span className="pg-code-chip">
                    {programCodeChipLabel(item.code)}
                  </span>
                  <span className="pg-deleted-item-count">
                    {cardExerciseCountLine(item.exercise_count)}
                  </span>
                </div>
                <button
                  type="button"
                  className="pg-btn pg-btn--secondary"
                  disabled={restoringId === item.program_id}
                  onClick={() => {
                    onRestore(item);
                  }}
                >
                  {RESTORE}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NewProgramSheet
        open={newSheetOpen}
        onClose={() => {
          setNewSheetOpen(false);
          if (searchParams.get("new") === "1") {
            navigate(fillPhysioAppRoutePattern("programs"), { replace: true });
          }
        }}
        onFromScratch={createFromScratch}
      />
    </section>
  );
}
