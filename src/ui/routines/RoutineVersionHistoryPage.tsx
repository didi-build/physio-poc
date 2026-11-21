import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { RoutineVersionHistoryItem } from "../../services/routines/types.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import { useToast } from "../components/Toast.js";
import {
  BACK_ROUTINES,
  FIRST_VERSION,
  LIVE,
  RESTORED_FROM_BADGE_PREFIX,
  RESTORE_THIS_VERSION,
  RESTORE_VERSION_PROGRAMS_NOTE,
  VERSION_HISTORY,
  RESTORE_CANCEL_NOTE,
  sentProgramsFromVersion,
  toastVersionRestored,
} from "../copy/routines.js";
import {
  SharedFailedSaveAlert,
  SharedItemBackLink,
  SharedItemSkeletonPlaceholders,
  SharedNotFoundState,
  sharedRefreshFailed,
} from "../shared-load-states/SharedLoadStates.js";
import { didi1273FailedSaveMessage } from "../shared-load-states/failed-save.js";
import { RoutinesItemBusyState, RoutinesItemLoadBanner } from "./RoutinesStates.js";
import { RoutineRestoreConfirmSheet } from "./RoutineRestoreConfirmSheet.js";

export function RoutineVersionHistoryPage() {
  const { routineId = "" } = useParams();
  const client = useRoutinesApi();
  const { showToast } = useToast();
  const [restoreTarget, setRestoreTarget] = useState<RoutineVersionHistoryItem | null>(
    null,
  );
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const sessionReady = usePractitionerSession().status === "ready";

  const {
    data,
    loading: cacheLoading,
    loadFailed,
    failureKind,
    refresh,
  } = useSessionCachedRead({
    cacheKey: routineId.length > 0 && sessionReady ? `rt-versions:${routineId}` : null,
    enabled: routineId.length > 0 && sessionReady,
    fetcher: (signal) => client.getRoutineVersionHistory(routineId, { signal }),
  });

  const onRestore = () => {
    if (!restoreTarget) {
      return;
    }
    setRestoreBusy(true);
    setRestoreFailed(false);
    const fromVersion = restoreTarget.version_number;
    void client
      .restoreRoutineVersion(routineId, fromVersion)
      .then((result) => {
        setRestoreTarget(null);
        showToast({
          message: toastVersionRestored(
            result.restored_from_version_number,
            result.version_number,
          ),
        });
        void refresh({ force: true });
      })
      .catch(() => {
        setRestoreFailed(true);
      })
      .finally(() => {
        setRestoreBusy(false);
      });
  };

  const loading = !sessionReady || cacheLoading;
  const hasCachedContent = data !== null;
  const refreshLoadFailed = sharedRefreshFailed(hasCachedContent, loadFailed);
  const showNotFound = !loading && loadFailed && failureKind === "not_found";
  const showContent =
    !loading && !showNotFound && (!loadFailed || refreshLoadFailed) && data !== null;

  const reload = useCallback(() => refresh({ force: true }), [refresh]);

  if (!showContent) {
    return (
      <section className="ex-page rt-versions" aria-busy={loading ? true : undefined}>
        <SharedItemBackLink
          surface="routines"
          href={fillPhysioAppRoutePattern("routineDetail", { routineId })}
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
            {loading ? (
              <RoutinesItemBusyState testId="exercise-library-busy-skeleton" />
            ) : null}
            <RoutinesItemLoadBanner
              loadFailed={loadFailed && failureKind === "error"}
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

  return (
    <section className="ex-page rt-versions" aria-labelledby="rt-versions-title">
      <Link
        to={fillPhysioAppRoutePattern("routineDetail", { routineId })}
        className="ex-back-link"
      >
        {BACK_ROUTINES}
      </Link>
      <h1 id="rt-versions-title" className="ex-page-title">
        {VERSION_HISTORY}
      </h1>
      {restoreFailed ? (
        <SharedFailedSaveAlert
          message={didi1273FailedSaveMessage("routine_restore_version")}
          onTryAgain={onRestore}
          testId="routine-restore-version-failed-save-alert"
        />
      ) : null}

      <ul className="rt-version-list">
        {data.versions.map((version) => (
          <li key={version.routine_version_id} className="rt-version-card">
            <div className="rt-version-badges">
              {version.is_live ? (
                <span className="rt-badge rt-badge--green">{LIVE}</span>
              ) : null}
              {version.version_number === 1 ? (
                <span className="rt-badge rt-badge--slate">{FIRST_VERSION}</span>
              ) : null}
              {version.restored_from_version_number !== null ? (
                <span className="rt-badge rt-badge--amber">
                  {RESTORED_FROM_BADGE_PREFIX}
                  {version.restored_from_version_number}
                </span>
              ) : null}
            </div>
            <h2>
              {version.name} · v{version.version_number}
            </h2>
            {version.change_summary ? <p>{version.change_summary}</p> : null}
            <p className="ex-muted">
              {sentProgramsFromVersion(version.sent_program_count)}
            </p>
            {!version.is_live ? (
              <button
                type="button"
                className="ex-secondary-btn"
                data-testid={`rt-restore-v${version.version_number}`}
                onClick={() => {
                  setRestoreTarget(version);
                }}
              >
                {RESTORE_THIS_VERSION}
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="ex-muted">{RESTORE_VERSION_PROGRAMS_NOTE}</p>

      <RoutineRestoreConfirmSheet
        open={restoreTarget !== null}
        version={restoreTarget}
        nextVersion={data.live_version_number + 1}
        busy={restoreBusy}
        onClose={() => {
          setRestoreTarget(null);
        }}
        onConfirm={onRestore}
        cancelNote={RESTORE_CANCEL_NOTE}
      />
    </section>
  );
}
