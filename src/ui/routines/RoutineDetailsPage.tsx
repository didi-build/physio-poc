import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type {
  RoutineDetailsResult,
  RoutineExerciseRow,
} from "../../services/routines/types.js";
import { formatExerciseParams } from "../../domain/format-exercise-params.js";
import {
  useCurrentPractitionerIdentity,
  usePractitionerSession,
} from "../api/practitioner-session-context.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { useProgramsApi } from "../api/programs-context.js";
import { routineDetailKey } from "../api/navigation-read-cache-keys.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import { useToast } from "../components/Toast.js";
import {
  BACK_ROUTINES,
  COMMUNITY_LIVE_LINE,
  COMMUNITY_UPDATED_BADGE,
  communityRoutineMeta,
  communityUpdatedBanner,
  CREATE_PROGRAM,
  CREATE_PROGRAM_FROM_ROUTINE,
  CREATE_PROGRAM_HINT,
  EDIT_FOR_EVERYONE,
  EDIT_MY_COPY,
  EXERCISES_HEADING,
  IN_MY_ROUTINES,
  KEEP_MINE,
  MAKE_MY_OWN_COPY,
  REMOVE_FROM_MY,
  ROUTINE_PAGE_NOTE,
  SAVE_TO_MY_ROUTINES,
  SEE_THEM_IN_PROGRAMS,
  SEGMENT_HINT,
  sentRoutineTimes,
  toastAdoptedVersion,
  toastKeptCopy,
  toastRemovedFromMy,
  toastSavedToMy,
  UPDATE_MY_COPY,
  USE_FOR_PATIENT,
  USE_FOR_PATIENT_HINT,
  USE_THIS_ROUTINE,
  VERSION_HISTORY,
  WHAT_CHANGED,
  YOUR_CHANGE,
  adoptWarnsReplace,
  communitySegmentLabel,
  myCopyFrozenLine,
  myCopySegmentLabel,
  useVersionN,
} from "../copy/routines.js";
import { programCreatedFromRoutineToast } from "../copy/programs.js";
import {
  createProgramFromRoutineAtApi,
  resolveRoutineProgramSource,
} from "../programs/program-from-routine.js";
import { ROUTINE_DETAIL_HEADING } from "../copy/routines.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryDetailErrorSlot,
  ExerciseLibraryErrorSlot,
} from "../exercise-library/ExerciseLibraryStates.js";
import { formatListDate } from "../exercise-library/library-filters.js";

type SourceView = "community" | "mine";

const TYPE_LABELS: Record<string, string> = {
  stretching: "Stretching",
  isometric: "Isometric",
  concentric: "Concentric",
  eccentric: "Eccentric",
};

function activeRows(
  details: RoutineDetailsResult,
  source: SourceView,
): RoutineExerciseRow[] {
  if (source === "mine" && details.my_copy) {
    return details.my_copy.rows;
  }
  return details.community.rows;
}

export function RoutineDetailsPage() {
  const { routineId = "" } = useParams();
  const client = useRoutinesApi();
  const programsClient = useProgramsApi();
  const practitioner = useCurrentPractitionerIdentity();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [mutationFailed, setMutationFailed] = useState(false);
  const [routineProgramBusy, setRoutineProgramBusy] = useState(false);
  const [source, setSource] = useState<SourceView>("community");
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
    refresh,
  } = useSessionCachedRead<RoutineDetailsResult>({
    cacheKey,
    enabled: routineId.length > 0 && sessionReady,
    fetcher: (signal) => client.getRoutineDetails(routineId, { signal }),
    retainOnError: true,
  });

  useEffect(() => {
    if (details?.my_copy) {
      setSource("mine");
    }
  }, [details?.my_copy]);

  const load = () => {
    void refresh({ force: true });
  };

  const showDetailContent = !loading && !loadFailed && details !== null;
  const name = details?.community.name ?? ROUTINE_DETAIL_HEADING;

  const flagged = details?.my_copy?.community_updated ?? false;
  const saved = details?.my_copy != null;
  const behind =
    saved &&
    details != null &&
    details.community.version_number > details.my_copy!.source_version_number;

  const rows = useMemo(
    () => (details ? activeRows(details, source) : []),
    [details, source],
  );

  if (sessionState.status === "error") {
    return (
      <section className="ex-page rt-detail" aria-labelledby="rt-detail-heading">
        <ExerciseLibraryDetailErrorSlot />
      </section>
    );
  }

  if (!showDetailContent) {
    return (
      <section
        className="ex-page rt-detail"
        aria-labelledby="rt-detail-heading"
        aria-busy={loading ? true : undefined}
      >
        <Link to={fillPhysioAppRoutePattern("routines")} className="ex-back-link">
          {BACK_ROUTINES}
        </Link>
        <h1 id="rt-detail-heading" className="ex-page-title">
          {name}
        </h1>
        {loading ? <ExerciseLibraryBusyState /> : null}
        {loadFailed ? <ExerciseLibraryDetailErrorSlot /> : null}
      </section>
    );
  }

  const community = details.community;
  const myCopy = details.my_copy;
  const byYou = community.created_by === practitioner.practitionerId;
  const personalChanges = details.personal_changes;
  const editCount = personalChanges?.baseline_available
    ? personalChanges.change_count
    : 0;
  const yourChangePositions = new Set(personalChanges?.your_change_positions ?? []);

  const onSave = () => {
    setMutationFailed(false);
    void client
      .saveToMyRoutines(routineId)
      .then(({ undo }) => {
        showToast({
          message: toastSavedToMy(community.name),
          onUndo: () => {
            setMutationFailed(false);
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setMutationFailed(true);
              });
          },
        });
        load();
      })
      .catch(() => {
        setMutationFailed(true);
      });
  };

  const onRemove = () => {
    setMutationFailed(false);
    void client
      .removeFromMyRoutines(routineId)
      .then(({ undo }) => {
        showToast({
          message: toastRemovedFromMy(community.name),
          onUndo: () => {
            setMutationFailed(false);
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setMutationFailed(true);
              });
          },
        });
        load();
      })
      .catch(() => {
        setMutationFailed(true);
      });
  };

  const onAdopt = () => {
    setMutationFailed(false);
    void client
      .adoptCommunityVersion(routineId)
      .then(({ undo, adopted_version }) => {
        showToast({
          message: toastAdoptedVersion(adopted_version),
          onUndo: () => {
            setMutationFailed(false);
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setMutationFailed(true);
              });
          },
        });
        load();
      })
      .catch(() => {
        setMutationFailed(true);
      });
  };

  const startProgramFromRoutine = (openPublishSheet: boolean) => {
    if (!details) {
      return;
    }
    const apiSource = resolveRoutineProgramSource(saved, source);
    setMutationFailed(false);
    setRoutineProgramBusy(true);
    void createProgramFromRoutineAtApi(programsClient, {
      routineId,
      source: apiSource,
      rowCount: rows.length,
    })
      .then((result) => {
        if (!openPublishSheet) {
          showToast({ message: programCreatedFromRoutineToast(community.name) });
        }
        navigate(
          fillPhysioAppRoutePattern("programBuilder", {
            programCode: result.program.code,
          }),
          {
            state: openPublishSheet ? { openPublishSheet: true } : undefined,
          },
        );
      })
      .catch(() => {
        setMutationFailed(true);
      })
      .finally(() => {
        setRoutineProgramBusy(false);
      });
  };

  const onKeep = () => {
    setMutationFailed(false);
    void client
      .keepMyCopyVersion(routineId)
      .then(({ undo }) => {
        const version = myCopy?.source_version_number ?? community.version_number;
        showToast({
          message: toastKeptCopy(version),
          onUndo: () => {
            setMutationFailed(false);
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setMutationFailed(true);
              });
          },
        });
        load();
      })
      .catch(() => {
        setMutationFailed(true);
      });
  };

  return (
    <section className="ex-page rt-detail" aria-labelledby="rt-detail-heading">
      <Link to={fillPhysioAppRoutePattern("routines")} className="ex-back-link">
        {BACK_ROUTINES}
      </Link>

      <div className="rt-detail-badges">
        {details.conditions_available && details.condition_label ? (
          <span className="rt-badge rt-badge--teal">{details.condition_label}</span>
        ) : null}
        <span className="rt-badge rt-badge--slate">{details.body_region_label}</span>
        {saved ? (
          <span className="rt-badge rt-badge--green">{IN_MY_ROUTINES}</span>
        ) : null}
        {flagged ? (
          <span className="rt-badge rt-badge--amber">{COMMUNITY_UPDATED_BADGE}</span>
        ) : null}
      </div>

      <h1 id="rt-detail-heading" className="ex-page-title">
        {community.name}
      </h1>

      {mutationFailed ? (
        <ExerciseLibraryErrorSlot
          message={undefined}
          testId="routine-detail-mutation-error-slot"
        />
      ) : null}

      <p className="rt-detail-meta">
        {communityRoutineMeta(
          community.version_number,
          formatListDate(community.updated_at),
          byYou,
          community.usage_count,
        )}
      </p>

      {details.who_its_for ? (
        <p className="rt-detail-about">{details.who_its_for}</p>
      ) : null}

      {flagged && myCopy ? (
        <div
          className="rt-update-banner"
          role="status"
          data-testid="routine-update-banner"
        >
          <p className="rt-update-banner-title">
            {communityUpdatedBanner(
              community.version_number,
              formatListDate(community.updated_at),
              myCopy.source_version_number,
            )}
          </p>
          <div className="rt-update-panel">
            <h2 className="rt-update-panel-title">{WHAT_CHANGED}</h2>
            {details.community_change_list?.baseline_available &&
            details.community_change_list.entries.length ? (
              <ul className="rt-update-list" data-testid="routine-community-changes">
                {details.community_change_list.entries.map((entry) => (
                  <li
                    key={entry.version_number}
                    className="rt-update-list-item"
                    data-testid={`routine-community-change-v${entry.version_number}`}
                  >
                    <span className="rt-update-list-version">
                      v{entry.version_number}
                    </span>
                    {entry.change_summary ? (
                      <span className="rt-update-list-summary">
                        {entry.change_summary}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {personalChanges?.baseline_available && editCount > 0 ? (
              <p className="rt-update-warn">
                {adoptWarnsReplace(editCount, community.version_number)}
              </p>
            ) : null}
            <div className="rt-update-actions">
              <button type="button" className="ex-primary-btn" onClick={onAdopt}>
                {useVersionN(community.version_number)}
              </button>
              <button type="button" className="ex-secondary-btn" onClick={onKeep}>
                {KEEP_MINE}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saved && myCopy ? (
        <div className="rt-segment" data-testid="routine-version-segment">
          <div className="ex-sort-row" role="radiogroup" aria-label="Version to use">
            <button
              type="button"
              role="radio"
              aria-checked={source === "mine"}
              className={`ex-sort-option${source === "mine" ? " ex-sort-option--active" : ""}`}
              onClick={() => {
                setSource("mine");
              }}
            >
              {myCopySegmentLabel(
                myCopy.source_version_number,
                (personalChanges?.baseline_available && editCount > 0) ?? false,
              )}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={source === "community"}
              className={`ex-sort-option${source === "community" ? " ex-sort-option--active" : ""}`}
              onClick={() => {
                setSource("community");
              }}
            >
              {communitySegmentLabel(community.version_number)}
            </button>
          </div>
          <p className="rt-segment-hint">
            {source === "mine"
              ? myCopyFrozenLine(
                  myCopy.source_version_number,
                  (personalChanges?.baseline_available && editCount > 0) ?? false,
                  editCount,
                )
              : COMMUNITY_LIVE_LINE}{" "}
            {SEGMENT_HINT}
          </p>
        </div>
      ) : null}

      <div className="rt-exercises-panel">
        <div className="rt-exercises-header">
          <h2>{EXERCISES_HEADING}</h2>
          <span>{rows.length} total</span>
        </div>
        <ol className="rt-exercise-list">
          {rows.map((row) => (
            <li key={`${row.exercise_id}-${row.position}`} className="rt-exercise-row">
              <span className="rt-exercise-pos">{row.position + 1}</span>
              <div className="rt-exercise-thumb" aria-hidden />
              <div className="rt-exercise-body">
                <div className="rt-exercise-name">{row.exercise_name}</div>
                <span className="rt-type-chip">
                  {TYPE_LABELS[row.prescription_type]}
                </span>
                <p className="rt-exercise-dose">{formatExerciseParams(row.params)}</p>
                {source === "mine" && yourChangePositions.has(row.position) ? (
                  <span className="rt-your-change">{YOUR_CHANGE}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <p className="rt-detail-note">{ROUTINE_PAGE_NOTE}</p>

      {details.sent_program_count > 0 ? (
        <div className="rt-sent-panel">
          <h2>{sentRoutineTimes(details.sent_program_count)}</h2>
          <ul className="rt-sent-codes">
            {details.sent_program_codes.map((code) => (
              <li key={code}>
                <span className="rt-program-code">{code}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ex-link-btn"
            onClick={() => {
              navigate(fillPhysioAppRoutePattern("programs"));
            }}
          >
            {SEE_THEM_IN_PROGRAMS}
          </button>
        </div>
      ) : null}

      <div className="rt-detail-aside">
        <h2>{USE_THIS_ROUTINE}</h2>
        <button
          type="button"
          className="ex-primary-btn"
          disabled={routineProgramBusy}
          onClick={() => {
            startProgramFromRoutine(true);
          }}
        >
          {USE_FOR_PATIENT}
        </button>
        <p className="rt-action-hint">{USE_FOR_PATIENT_HINT}</p>
        <button
          type="button"
          className="ex-secondary-btn"
          disabled={routineProgramBusy}
          onClick={() => {
            startProgramFromRoutine(false);
          }}
        >
          {CREATE_PROGRAM_FROM_ROUTINE}
        </button>
        <p className="rt-action-hint">{CREATE_PROGRAM_HINT}</p>

        <div className="rt-detail-more">
          {!saved ? (
            <button type="button" className="ex-secondary-btn" onClick={onSave}>
              {SAVE_TO_MY_ROUTINES}
            </button>
          ) : null}
          {saved && behind && !flagged && myCopy ? (
            <button type="button" className="ex-secondary-btn" onClick={onAdopt}>
              {UPDATE_MY_COPY} {community.version_number}
            </button>
          ) : null}
          <button
            type="button"
            className="ex-secondary-btn"
            onClick={() => {
              if (saved) {
                navigate(fillPhysioAppRoutePattern("routineMyCopy", { routineId }));
              } else {
                onSave();
              }
            }}
          >
            {saved ? EDIT_MY_COPY : MAKE_MY_OWN_COPY}
          </button>
          <button type="button" className="ex-secondary-btn" disabled>
            {EDIT_FOR_EVERYONE}
          </button>
          <button type="button" className="ex-secondary-btn" disabled>
            {VERSION_HISTORY}
          </button>
          {saved ? (
            <button type="button" className="ex-link-btn ex-danger" onClick={onRemove}>
              {REMOVE_FROM_MY}
            </button>
          ) : null}
        </div>
      </div>

      <div className="rt-mobile-actions">
        <button
          type="button"
          className="ex-secondary-btn"
          disabled={routineProgramBusy}
          onClick={() => {
            startProgramFromRoutine(false);
          }}
        >
          {CREATE_PROGRAM}
        </button>
        <button
          type="button"
          className="ex-primary-btn"
          disabled={routineProgramBusy}
          onClick={() => {
            startProgramFromRoutine(true);
          }}
        >
          {USE_FOR_PATIENT}
        </button>
      </div>
    </section>
  );
}
