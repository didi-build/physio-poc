import { useEffect, useState } from "react";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import type {
  ApprovedExerciseSummary,
  MyExerciseListItem,
} from "../../services/exercise-library/types.js";
import { useExerciseLibraryApi } from "../api/exercise-library-context.js";
import {
  ADD_EXERCISE,
  ADD_EXERCISE_SHEET_INTRO,
  ALL_EXERCISES,
  FROM_FULL_LIBRARY,
  MY_EXERCISES,
  NO_APPROVED_MATCH,
  SEARCH_ALL_EXERCISES,
  SEARCH_EXERCISES,
  SEARCH_FULL_LIBRARY,
  SEARCH_MY_FIRST,
  addExerciseChoiceLabel,
  NOTHING_IN_MY_MATCHES,
} from "../copy/programs.js";
import { CANCEL } from "../copy/my-defaults.js";

function flattenMy(items: {
  new_from_requests: MyExerciseListItem[];
  pinned: MyExerciseListItem[];
  recently_used_and_saved: MyExerciseListItem[];
}): MyExerciseListItem[] {
  return [
    ...items.new_from_requests,
    ...items.pinned,
    ...items.recently_used_and_saved,
  ];
}

export type AddExerciseSheetProps = {
  open: boolean;
  onClose: () => void;
  onPickExercise: (exerciseId: string, exerciseName: string) => void;
};

export function AddExerciseSheet({
  open,
  onClose,
  onPickExercise,
}: AddExerciseSheetProps) {
  const library = useExerciseLibraryApi();
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [query, setQuery] = useState("");
  const [myItems, setMyItems] = useState<MyExerciseListItem[]>([]);
  const [approved, setApproved] = useState<ApprovedExerciseSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoading(true);
    void library
      .listMyExercises({ q: query || undefined })
      .then((result) => {
        if (result.list_state === "ok") {
          setMyItems(flattenMy(result.sections));
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [library, open, query]);

  useEffect(() => {
    if (!open || tab !== "all") {
      return;
    }
    setLoading(true);
    void library
      .searchApproved({ q: query || undefined })
      .then((result) => {
        setApproved(result.exercises);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [library, open, tab, query]);

  const myFiltered = myItems;
  const showMyEmpty =
    tab === "mine" && !loading && myFiltered.length === 0 && query.trim();

  return (
    <ConfirmSheet
      open={open}
      title={ADD_EXERCISE}
      titleId="pg-add-exercise-title"
      onClose={onClose}
      subtitle={ADD_EXERCISE_SHEET_INTRO}
      footer={
        <button type="button" className="pg-btn pg-btn--secondary" onClick={onClose}>
          {CANCEL}
        </button>
      }
    >
      <div className="pg-add-exercise-tabs">
        <button
          type="button"
          className={`pg-tab${tab === "mine" ? " pg-tab--active" : ""}`}
          aria-pressed={tab === "mine"}
          onClick={() => {
            setTab("mine");
          }}
        >
          {MY_EXERCISES}
        </button>
        <button
          type="button"
          className={`pg-tab${tab === "all" ? " pg-tab--active" : ""}`}
          aria-pressed={tab === "all"}
          onClick={() => {
            setTab("all");
          }}
        >
          {ALL_EXERCISES}
        </button>
      </div>
      <label className="pg-search-label">
        <span className="pg-search-label-text">
          {tab === "mine" ? SEARCH_MY_FIRST : SEARCH_FULL_LIBRARY}
        </span>
        <input
          type="search"
          className="pg-search-input"
          aria-label={tab === "mine" ? SEARCH_EXERCISES : SEARCH_ALL_EXERCISES}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>
      {loading ? <p className="pg-add-exercise-loading" aria-busy /> : null}
      {tab === "mine" ? (
        <ul className="pg-add-exercise-list">
          {myFiltered.map((item) => (
            <li key={item.exercise_id}>
              <button
                type="button"
                className="pg-add-exercise-item"
                onClick={() => {
                  onPickExercise(item.exercise_id, item.exercise_name);
                }}
              >
                {addExerciseChoiceLabel(item.exercise_name)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="pg-add-exercise-section">{FROM_FULL_LIBRARY}</p>
          <ul className="pg-add-exercise-list">
            {approved.map((item) => (
              <li key={item.exercise_id}>
                <button
                  type="button"
                  className="pg-add-exercise-item"
                  onClick={() => {
                    onPickExercise(item.exercise_id, item.exercise_name);
                  }}
                >
                  {addExerciseChoiceLabel(item.exercise_name)}
                </button>
              </li>
            ))}
          </ul>
          {!loading && approved.length === 0 ? (
            <p className="pg-add-exercise-empty">{NO_APPROVED_MATCH}</p>
          ) : null}
        </>
      )}
      {showMyEmpty ? (
        <p className="pg-add-exercise-empty">{NOTHING_IN_MY_MATCHES}</p>
      ) : null}
    </ConfirmSheet>
  );
}
