import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PublishValidationIssue } from "../../services/routines/types.js";
import { RoutinesAuthoringError } from "../api/routines-client.js";
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
  DRAFT_DETAIL_SAVED_NOTE,
  DRAFT_DETAIL_VISIBILITY,
  DRAFT_PUBLISH_NOTE,
  DISCARD_DRAFT,
  EDIT_DRAFT,
  PUBLISH,
  SAVE_TO_MY_ROUTINES,
  SEE_THEM_IN_PROGRAMS,
  SEGMENT_HINT,
  sentRoutineTimes,
  toastAdoptedVersion,
  toastKeptCopy,
  toastRemovedFromMy,
  toastSavedToMy,
  toastDiscardedDraft,
  toastPublishedVersion1,
  KEPT_AS_DRAFT,
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
  SharedFailedSaveAlert,
  SharedItemBackLink,
  SharedNotFoundState,
  SharedItemSkeletonPlaceholders,
  sharedRefreshFailed,
} from "../shared-load-states/SharedLoadStates.js";
import {
  didi1273FailedSaveMessage,
  mappedFailedSaveMessage,
  type MappedFailedSaveAction,
} from "../shared-load-states/failed-save.js";
import { RoutinesItemBusyState, RoutinesItemLoadBanner } from "./RoutinesStates.js";
import { formatListDate } from "../exercise-library/library-filters.js";
import { capitalizeBodyRegionLabel } from "./body-region-display.js";
import { RoutinePublishSheet } from "./RoutinePublishSheet.js";
import { RoutinePublishValidationPanel } from "./RoutinePublishValidationPanel.js";
import { reindexRoutineRows } from "./routine-row-utils.js";

type SourceView = "community" | "mine";

function draftRowsPayload(rows: RoutineExerciseRow[]) {
  return rows.map((row) => ({
    position: row.position,
    exercise_id: row.exercise_id,
    exercise_version_id: row.exercise_version_id,
    prescription_type: row.prescription_type,
    params: row.params,
  }));
}

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
  if (details.is_draft) {
    return details.draft.rows;
  }
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
  const [failedSaveAlert, setFailedSaveAlert] = useState<{
    message: string;
    onTryAgain: () => void;
    testId: string;
  } | null>(null);
  const [routineProgramBusy, setRoutineProgramBusy] = useState(false);
  const [source, setSource] = useState<SourceView>("community");
  const [draftPublishOpen, setDraftPublishOpen] = useState(false);
  const [draftPublishBusy, setDraftPublishBusy] = useState(false);
  const [draftServerMissingImagesBlock, setDraftServerMissingImagesBlock] =
    useState(false);
  const [draftMissingImagesFocusHeading, setDraftMissingImagesFocusHeading] =
    useState(false);
  const [draftValidation, setDraftValidation] = useState<
    PublishValidationIssue[] | null
  >(null);
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
    if (details?.my_copy) {
      setSource("mine");
    }
  }, [details?.my_copy]);

  const load = useCallback(() => refresh({ force: true }), [refresh]);

  const loading = !sessionReady || cacheLoading;
  const hasCachedContent = details !== null;
  const refreshLoadFailed = sharedRefreshFailed(hasCachedContent, loadFailed);
  const showNotFound = !loading && loadFailed && failureKind === "not_found";
  const showDetailContent =
    !loading && !showNotFound && (!loadFailed || refreshLoadFailed) && details !== null;
  const name = details?.is_draft
    ? (details.draft.name ?? ROUTINE_DETAIL_HEADING)
    : (details?.community.name ?? ROUTINE_DETAIL_HEADING);

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

  if (!showDetailContent) {
    return (
      <section
        className="ex-page rt-detail"
        aria-labelledby="rt-detail-heading"
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
              <h1 id="rt-detail-heading" className="ex-page-title">
                {name}
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
              onTryAgain={load}
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

  if (details.is_draft) {
    const draftName = details.draft.name?.trim() || name;
    const onDiscardDraft = () => {
      setFailedSaveAlert(null);
      void client
        .discardRoutineDraft(routineId)
        .then(({ undo }) => {
          const discardedName = details.draft.name ?? "";
          showToast({
            message: toastDiscardedDraft(discardedName),
            onUndo: () => {
              void client.undoRoutineDraftDiscard(routineId, undo).then(() => {
                navigate(fillPhysioAppRoutePattern("routineDetail", { routineId }));
                load();
              });
            },
          });
          navigate(fillPhysioAppRoutePattern("routines"), { replace: true });
        })
        .catch(() => {
          setFailedSaveAlert({
            message: didi1273FailedSaveMessage("routine_discard_draft"),
            onTryAgain: onDiscardDraft,
            testId: "routine-draft-discard-failed-save-alert",
          });
        });
    };
    const onDraftPublish = () => {
      setDraftValidation(null);
      setDraftServerMissingImagesBlock(false);
      setDraftMissingImagesFocusHeading(false);
      setDraftPublishOpen(true);
    };
    const confirmDraftPublish = () => {
      setDraftPublishBusy(true);
      setFailedSaveAlert(null);
      void client
        .publishRoutineDraft(routineId, {
          name: details.draft.name ?? undefined,
        })
        .then(() => {
          setDraftPublishOpen(false);
          showToast({ message: toastPublishedVersion1(draftName) });
          load();
        })
        .catch((error: unknown) => {
          if (error instanceof RoutinesAuthoringError && error.validationIssues) {
            setDraftValidation(error.validationIssues);
            setDraftPublishOpen(false);
            return;
          }
          if (
            error instanceof RoutinesAuthoringError &&
            error.code === "missing_images_block_publish"
          ) {
            void client
              .getRoutineDetails(routineId)
              .then(() => {
                load();
              })
              .catch(() => {});
            setDraftServerMissingImagesBlock(true);
            setDraftMissingImagesFocusHeading(true);
            return;
          }
          setDraftPublishOpen(false);
          setFailedSaveAlert({
            message: didi1273FailedSaveMessage("routine_publish"),
            onTryAgain: confirmDraftPublish,
            testId: "routine-draft-publish-failed-save-alert",
          });
        })
        .finally(() => {
          setDraftPublishBusy(false);
        });
    };
    const removeDraftMissingImagesRow = (position: number) => {
      const next = reindexRoutineRows(
        details.draft.rows.filter((row) => row.position !== position),
      );
      setDraftServerMissingImagesBlock(false);
      void client
        .autosaveRoutineDraft(routineId, {
          name: details.draft.name,
          who_its_for: details.who_its_for,
          condition_id: details.condition_id,
          body_region_id: details.body_region_id,
          rows: draftRowsPayload(next),
        })
        .then(() => {
          load();
        })
        .catch(() => {});
    };

    return (
      <section
        className="ex-page rt-detail rt-detail--draft"
        aria-labelledby="rt-detail-heading"
      >
        <Link to={fillPhysioAppRoutePattern("routines")} className="ex-back-link">
          {BACK_ROUTINES}
        </Link>
        <div className="rt-detail-badges">
          <span className="rt-tag rt-tag--draft">{DRAFT_DETAIL_VISIBILITY}</span>
          <span className="rt-badge rt-badge--slate">
            {capitalizeBodyRegionLabel(details.body_region_label)}
          </span>
        </div>
        <h1 id="rt-detail-heading" className="ex-page-title">
          {draftName}
        </h1>
        {failedSaveAlert ? (
          <SharedFailedSaveAlert
            message={failedSaveAlert.message}
            onTryAgain={failedSaveAlert.onTryAgain}
            testId={failedSaveAlert.testId}
          />
        ) : null}
        <p className="rt-draft-detail-note">{DRAFT_DETAIL_SAVED_NOTE}</p>
        {details.who_its_for ? <p>{details.who_its_for}</p> : null}
        {draftValidation ? (
          <RoutinePublishValidationPanel issues={draftValidation} />
        ) : null}
        <div className="rt-exercises-panel">
          <h2>{EXERCISES_HEADING}</h2>
          <ul className="rt-exercise-list">
            {details.draft.rows.map((row) => (
              <li
                key={`${row.exercise_id}-${row.position}`}
                className="rt-exercise-row"
              >
                <span className="rt-exercise-pos">{row.position + 1}</span>
                <span>{row.exercise_name}</span>
                <span className="rt-type-chip">
                  {TYPE_LABELS[row.prescription_type] ?? row.prescription_type}
                </span>
                <span>{formatExerciseParams(row.params)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="rt-detail-note">{DRAFT_PUBLISH_NOTE}</p>
        <div className="rt-draft-detail-actions">
          <button
            type="button"
            className="ex-secondary-btn"
            onClick={() => {
              navigate(fillPhysioAppRoutePattern("routineDraftEdit", { routineId }));
            }}
          >
            {EDIT_DRAFT}
          </button>
          <button
            type="button"
            className="ex-primary-btn"
            data-testid="rt-draft-detail-publish"
            onClick={onDraftPublish}
          >
            {PUBLISH}
          </button>
        </div>
        <button
          type="button"
          className="ex-link-btn ex-danger"
          data-testid="rt-discard-draft"
          onClick={onDiscardDraft}
        >
          {DISCARD_DRAFT}
        </button>
        <RoutinePublishSheet
          open={draftPublishOpen}
          name={details.draft.name ?? ""}
          bodyRegionLabel={details.body_region_label}
          conditionLabel={details.condition_label}
          rows={details.draft.rows}
          publishBusy={draftPublishBusy}
          serverMissingImagesBlock={draftServerMissingImagesBlock}
          missingImagesFocusHeading={draftMissingImagesFocusHeading}
          onClose={() => {
            setDraftPublishOpen(false);
          }}
          onPublish={confirmDraftPublish}
          onNotYet={() => {
            setDraftPublishOpen(false);
            showToast({ message: KEPT_AS_DRAFT });
          }}
          onRemoveMissingImagesRow={removeDraftMissingImagesRow}
        />
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

  const setMappedFailedSave = (
    action: MappedFailedSaveAction,
    retry: () => void,
    testId = "routine-detail-mutation-error-slot",
  ) => {
    setFailedSaveAlert({
      message: mappedFailedSaveMessage(action),
      onTryAgain: retry,
      testId,
    });
  };

  const onSave = () => {
    setFailedSaveAlert(null);
    void client
      .saveToMyRoutines(routineId)
      .then(({ undo }) => {
        showToast({
          message: toastSavedToMy(community.name),
          onUndo: () => {
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setMappedFailedSave({ kind: "save_or_edit", item: "routine" }, onSave);
              });
          },
        });
        load();
      })
      .catch(() => {
        setMappedFailedSave({ kind: "save_or_edit", item: "routine" }, onSave);
      });
  };

  const onRemove = () => {
    setFailedSaveAlert(null);
    void client
      .removeFromMyRoutines(routineId)
      .then(({ undo }) => {
        showToast({
          message: toastRemovedFromMy(community.name),
          onUndo: () => {
            setFailedSaveAlert(null);
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setMappedFailedSave(
                  { kind: "delete_or_remove", item: "routine" },
                  onRemove,
                );
              });
          },
        });
        load();
      })
      .catch(() => {
        setMappedFailedSave({ kind: "delete_or_remove", item: "routine" }, onRemove);
      });
  };

  const onAdopt = () =>
    client
      .adoptCommunityVersion(routineId)
      .then(({ undo, adopted_version }) => {
        setFailedSaveAlert(null);
        showToast({
          message: toastAdoptedVersion(adopted_version),
          onUndo: () => {
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setFailedSaveAlert({
                  message: didi1273FailedSaveMessage("routine_adopt_version"),
                  onTryAgain: onAdopt,
                  testId: "routine-adopt-version-failed-save-alert",
                });
              });
          },
        });
        load();
      })
      .catch(() => {
        setFailedSaveAlert({
          message: didi1273FailedSaveMessage("routine_adopt_version"),
          onTryAgain: onAdopt,
          testId: "routine-adopt-version-failed-save-alert",
        });
        throw new Error("adopt_failed");
      });

  const startProgramFromRoutine = (openPublishSheet: boolean) => {
    if (!details) {
      return;
    }
    const apiSource = resolveRoutineProgramSource(saved, source);
    setFailedSaveAlert(null);
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
          fillPhysioAppRoutePattern(
            openPublishSheet ? "programPublish" : "programBuilder",
            { programCode: result.program.code },
          ),
        );
      })
      .catch(() => {
        /* create-program failure is not a DIDI-1273 failed-save action */
      })
      .finally(() => {
        setRoutineProgramBusy(false);
      });
  };

  const onKeep = () => {
    setFailedSaveAlert(null);
    void client
      .keepMyCopyVersion(routineId)
      .then(({ undo }) => {
        const version = myCopy?.source_version_number ?? community.version_number;
        showToast({
          message: toastKeptCopy(version),
          onUndo: () => {
            setFailedSaveAlert(null);
            void client
              .applyUndo(routineId, undo)
              .then(load)
              .catch(() => {
                setMappedFailedSave({ kind: "keep_your_version" }, onKeep);
              });
          },
        });
        load();
      })
      .catch(() => {
        setMappedFailedSave({ kind: "keep_your_version" }, onKeep);
      });
  };

  const detailMoreActions = (
    <div className="rt-detail-more">
      {!saved ? (
        <button type="button" className="ex-secondary-btn" onClick={onSave}>
          {SAVE_TO_MY_ROUTINES}
        </button>
      ) : null}
      {saved && behind && !flagged && myCopy ? (
        <button
          type="button"
          className="ex-secondary-btn"
          onClick={() => {
            void onAdopt().catch(() => {});
          }}
        >
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
      <button
        type="button"
        className="ex-secondary-btn"
        onClick={() => {
          navigate(fillPhysioAppRoutePattern("routineEditForEveryone", { routineId }));
        }}
      >
        {EDIT_FOR_EVERYONE}
      </button>
      <button
        type="button"
        className="ex-secondary-btn"
        onClick={() => {
          navigate(fillPhysioAppRoutePattern("routineVersionHistory", { routineId }));
        }}
      >
        {VERSION_HISTORY}
      </button>
      {saved ? (
        <button type="button" className="ex-link-btn ex-danger" onClick={onRemove}>
          {REMOVE_FROM_MY}
        </button>
      ) : null}
    </div>
  );

  const asideUseRoutine = (
    <div className="rt-detail-aside-primary">
      <h2>{USE_THIS_ROUTINE}</h2>
      <button
        type="button"
        className="ex-primary-btn"
        data-testid="routine-detail-aside-use-for-patient"
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
        data-testid="routine-detail-aside-create-program"
        disabled={routineProgramBusy}
        onClick={() => {
          startProgramFromRoutine(false);
        }}
      >
        {CREATE_PROGRAM_FROM_ROUTINE}
      </button>
      <p className="rt-action-hint">{CREATE_PROGRAM_HINT}</p>
    </div>
  );

  return (
    <section className="ex-page rt-detail" aria-labelledby="rt-detail-heading">
      <Link to={fillPhysioAppRoutePattern("routines")} className="ex-back-link">
        {BACK_ROUTINES}
      </Link>

      <div className="rt-detail-badges">
        {details.conditions_available && details.condition_label ? (
          <span className="rt-badge rt-badge--teal">{details.condition_label}</span>
        ) : null}
        <span className="rt-badge rt-badge--slate">
          {capitalizeBodyRegionLabel(details.body_region_label)}
        </span>
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

      {failedSaveAlert ? (
        <SharedFailedSaveAlert
          message={failedSaveAlert.message}
          onTryAgain={failedSaveAlert.onTryAgain}
          testId={failedSaveAlert.testId}
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
              <button
                type="button"
                className="ex-primary-btn"
                onClick={() => {
                  void onAdopt().catch(() => {});
                }}
              >
                {useVersionN(community.version_number)}
              </button>
              <button type="button" className="ex-secondary-btn" onClick={onKeep}>
                {KEEP_MINE}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rt-detail-layout">
        <div className="rt-detail-main">
          {saved && myCopy ? (
            <div className="rt-segment" data-testid="routine-version-segment">
              <div
                className="ex-sort-row"
                role="radiogroup"
                aria-label="Version to use"
              >
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
                <li
                  key={`${row.exercise_id}-${row.position}`}
                  className="rt-exercise-row"
                >
                  <span className="rt-exercise-pos">{row.position + 1}</span>
                  <div className="rt-exercise-thumb" aria-hidden />
                  <div className="rt-exercise-body">
                    <div className="rt-exercise-name">{row.exercise_name}</div>
                    <span className="rt-type-chip">
                      {TYPE_LABELS[row.prescription_type]}
                    </span>
                    <p className="rt-exercise-dose">
                      {formatExerciseParams(row.params)}
                    </p>
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
        </div>

        <aside className="rt-detail-aside" aria-label={USE_THIS_ROUTINE}>
          {asideUseRoutine}
        </aside>

        <div className="rt-detail-main-more">{detailMoreActions}</div>
      </div>

      <div className="rt-mobile-actions">
        <button
          type="button"
          className="ex-secondary-btn"
          data-testid="routine-detail-mobile-create-program"
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
          data-testid="routine-detail-mobile-use-for-patient"
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
