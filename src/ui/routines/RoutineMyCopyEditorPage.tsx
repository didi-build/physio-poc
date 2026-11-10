import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type {
  RoutineDetailsResult,
  RoutineExerciseRow,
} from "../../services/routines/types.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { routineDetailKey } from "../api/navigation-read-cache-keys.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import { useToast } from "../components/Toast.js";
import {
  BACK_ROUTINES,
  MY_COPY_EDITOR_INTRO,
  SAVE_MY_COPY,
  TOAST_SAVED_MY_COPY,
} from "../copy/routines.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryDetailErrorSlot,
  ExerciseLibraryErrorSlot,
} from "../exercise-library/ExerciseLibraryStates.js";

export function RoutineMyCopyEditorPage() {
  const { routineId = "" } = useParams();
  const client = useRoutinesApi();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [rows, setRows] = useState<RoutineExerciseRow[]>([]);
  const [mutationFailed, setMutationFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const sessionEpoch = useSessionReadCacheEpoch();
  const sessionState = usePractitionerSession();
  const sessionReady = sessionState.status === "ready";
  const cacheKey =
    routineId.length > 0 && sessionEpoch
      ? routineDetailKey(sessionEpoch, routineId)
      : null;
  const {
    data: details,
    loading,
    loadFailed,
  } = useSessionCachedRead<RoutineDetailsResult>({
    cacheKey,
    enabled: routineId.length > 0 && sessionReady,
    fetcher: (signal) => client.getRoutineDetails(routineId, { signal }),
    retainOnError: true,
  });

  useEffect(() => {
    setRows(details?.my_copy?.rows ?? []);
    setDirty(false);
  }, [details]);

  if (sessionState.status === "error") {
    return (
      <section className="ex-page rt-my-copy" aria-labelledby="rt-my-copy-heading">
        <ExerciseLibraryDetailErrorSlot />
      </section>
    );
  }

  const showContent =
    !loading &&
    !loadFailed &&
    details !== null &&
    !details.is_draft &&
    details.my_copy !== null;

  if (!showContent) {
    return (
      <section className="ex-page rt-my-copy" aria-labelledby="rt-my-copy-heading">
        <Link to={fillPhysioAppRoutePattern("routines")} className="ex-back-link">
          {BACK_ROUTINES}
        </Link>
        <h1 id="rt-my-copy-heading" className="ex-page-title">
          {details && !details.is_draft ? details.community.name : "Routine"}
        </h1>
        {loading ? <ExerciseLibraryBusyState /> : null}
        {loadFailed ? <ExerciseLibraryDetailErrorSlot /> : null}
      </section>
    );
  }

  const onHoldChange = (index: number, value: number) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, params: { ...row.params, hold_s: value } } : row,
      ),
    );
    setDirty(true);
  };

  const onSave = () => {
    setMutationFailed(false);
    void client
      .updateMyCopy(routineId, rows)
      .then(() => {
        showToast({ message: TOAST_SAVED_MY_COPY });
        navigate(fillPhysioAppRoutePattern("routineDetail", { routineId }));
      })
      .catch(() => {
        setMutationFailed(true);
      });
  };

  return (
    <section className="ex-page rt-my-copy" aria-labelledby="rt-my-copy-heading">
      <Link
        to={fillPhysioAppRoutePattern("routineDetail", { routineId })}
        className="ex-back-link"
      >
        {details!.community.name}
      </Link>
      <h1 id="rt-my-copy-heading" className="ex-page-title">
        {details!.community.name}
      </h1>
      <p className="ex-page-intro">{MY_COPY_EDITOR_INTRO}</p>

      {mutationFailed ? (
        <ExerciseLibraryErrorSlot
          message={undefined}
          testId="routine-my-copy-mutation-error-slot"
        />
      ) : null}

      <ol className="rt-exercise-list">
        {rows.map((row, index) => (
          <li key={`${row.exercise_id}-${row.position}`} className="rt-exercise-row">
            <span className="rt-exercise-pos">{row.position + 1}</span>
            <div className="rt-exercise-body">
              <div className="rt-exercise-name">{row.exercise_name}</div>
              <p className="rt-exercise-dose">{formatExerciseParams(row.params)}</p>
              <label className="rt-dose-edit">
                <span className="sr-only">{row.exercise_name}</span>
                <input
                  type="number"
                  className="ex-search-input"
                  value={typeof row.params.hold_s === "number" ? row.params.hold_s : 0}
                  onChange={(event) => {
                    onHoldChange(index, Number(event.target.value));
                  }}
                  data-testid={`rt-hold-${index}`}
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="ex-primary-btn"
        disabled={!dirty}
        onClick={onSave}
        data-testid="save-my-copy"
      >
        {SAVE_MY_COPY}
      </button>
    </section>
  );
}
