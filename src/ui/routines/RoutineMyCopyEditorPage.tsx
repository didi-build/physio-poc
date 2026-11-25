import { useCallback, useEffect, useState } from "react";
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
  MY_COPY_EDITOR_INTRO,
  SAVE_MY_COPY,
  TOAST_SAVED_MY_COPY,
} from "../copy/routines.js";
import {
  SharedFailedSaveAlert,
  SharedItemBackLink,
  SharedItemSkeletonPlaceholders,
  SharedNotFoundState,
  sharedRefreshFailed,
} from "../shared-load-states/SharedLoadStates.js";
import { mappedFailedSaveMessage } from "../shared-load-states/failed-save.js";
import { RoutinesItemBusyState, RoutinesItemLoadBanner } from "./RoutinesStates.js";

export function RoutineMyCopyEditorPage() {
  const { routineId = "" } = useParams();
  const client = useRoutinesApi();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [rows, setRows] = useState<RoutineExerciseRow[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
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
    loading: cacheLoading,
    loadFailed,
    failureKind,
    refresh,
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

  const loading = !sessionReady || cacheLoading;
  const hasCachedContent = details !== null;
  const refreshLoadFailed = sharedRefreshFailed(hasCachedContent, loadFailed);
  const showNotFound = !loading && loadFailed && failureKind === "not_found";
  const showContent =
    !loading &&
    !showNotFound &&
    (!loadFailed || refreshLoadFailed) &&
    details !== null &&
    !details.is_draft &&
    details.my_copy !== null;

  const reload = useCallback(() => refresh({ force: true }), [refresh]);

  if (!showContent) {
    const pageTitle = details && !details.is_draft ? details.community.name : "Routine";
    return (
      <section
        className="ex-page rt-my-copy"
        aria-labelledby="rt-my-copy-heading"
        aria-busy={loading ? true : undefined}
      >
        <SharedItemBackLink
          surface="routines"
          href={fillPhysioAppRoutePattern("routines")}
        />
        {showNotFound ? (
          <SharedNotFoundState
            item="routine"
            surface="routines"
            backHref={fillPhysioAppRoutePattern("routines")}
            testId="exercise-library-detail-error-slot"
          />
        ) : (
          <>
            {!showNotFound && !loading ? (
              <h1 id="rt-my-copy-heading" className="ex-page-title">
                {pageTitle}
              </h1>
            ) : null}
            {loading ? (
              <RoutinesItemBusyState testId="exercise-library-busy-skeleton" />
            ) : null}
            <RoutinesItemLoadBanner
              loadFailed={
                (loadFailed && failureKind === "error") ||
                sessionState.status === "error"
              }
              hasContent={hasCachedContent}
              onTryAgain={reload}
              testId="exercise-library-detail-error-slot"
            />
            {loadFailed && !hasCachedContent && !loading ? (
              <SharedItemSkeletonPlaceholders testId="exercise-library-busy-skeleton" />
            ) : null}
          </>
        )}
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

  const onSave = () =>
    client
      .updateMyCopy(routineId, rows)
      .then(() => {
        setSaveFailed(false);
        showToast({ message: TOAST_SAVED_MY_COPY });
        navigate(fillPhysioAppRoutePattern("routineDetail", { routineId }));
      })
      .catch(() => {
        setSaveFailed(true);
        throw new Error("save_failed");
      });

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

      {saveFailed ? (
        <SharedFailedSaveAlert
          message={mappedFailedSaveMessage({ kind: "save_or_edit", item: "routine" })}
          onTryAgain={onSave}
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
        onClick={() => {
          void onSave().catch(() => {});
        }}
        data-testid="save-my-copy"
      >
        {SAVE_MY_COPY}
      </button>
    </section>
  );
}
