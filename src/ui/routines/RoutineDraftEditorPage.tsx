import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type {
  PublishValidationIssue,
  BodyRegionListItem,
  RoutineConditionOption,
  RoutineDetailsDraft,
  RoutineExerciseRow,
} from "../../services/routines/types.js";
import { useExerciseLibraryApi } from "../api/exercise-library-context.js";
import { routineDetailKey } from "../api/navigation-read-cache-keys.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { RoutinesAuthoringError } from "../api/routines-client.js";
import { useToast } from "../components/Toast.js";
import { CANCEL } from "../copy/my-defaults.js";
import {
  ADD_AT_LEAST_ONE_EXERCISE_PUBLISH,
  ADD_EXERCISE,
  ADD_EXERCISE_TO_ROUTINE,
  ADD_NAME_TO_PUBLISH,
  BACK_ROUTINES,
  BODY_REGION,
  CONDITION,
  CONDITION_SAMPLE_LIST,
  CONDITION_SAMPLE_NOTE,
  DONE_FOR_NOW,
  EDIT_DRAFT,
  FROM_EXERCISE_LIBRARY,
  KEPT_AS_DRAFT,
  NEW_ROUTINE,
  NO_EXERCISES_ADD_FROM_LIBRARY,
  OPTIONAL_SUFFIX,
  PUBLISH,
  ROUTINE_NAME_LABEL,
  ROUTINE_NAME_PLACEHOLDER,
  TAG_DRAFT,
  WHO_ITS_FOR_LABEL,
  WHO_ITS_FOR_PLACEHOLDER,
  WHO_ITS_FOR_PRIVACY,
  toastPublishedVersion1,
} from "../copy/routines.js";
import { AddExerciseSheet } from "../programs/AddExerciseSheet.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryDetailErrorSlot,
} from "../exercise-library/ExerciseLibraryStates.js";
import { useProgramAutoSave } from "../programs/use-program-auto-save.js";
import { RoutineAuthoringExerciseList } from "./RoutineAuthoringExerciseList.js";
import { RoutineAutoSaveStatus } from "./RoutineAutoSaveStatus.js";
import { RoutinePublishSheet } from "./RoutinePublishSheet.js";
import { RoutinePublishValidationPanel } from "./RoutinePublishValidationPanel.js";
import { capitalizeBodyRegionLabel } from "./body-region-display.js";
import { isClientDraftUntouched } from "./routine-draft-untouched.js";
import { buildRoutineRowFromExerciseDetails } from "./routine-row-utils.js";

type DraftEditorSnapshot = RoutineDetailsDraft & {
  condition_options: RoutineConditionOption[];
};

type NewDraftBootstrap = {
  conditions_available: boolean;
  condition_options: RoutineConditionOption[];
};

type RoutineDraftEditorPageProps = {
  isNewDraft?: boolean;
};

function rowsPayload(rows: RoutineExerciseRow[]) {
  return rows.map((row) => ({
    position: row.position,
    exercise_id: row.exercise_id,
    exercise_version_id: row.exercise_version_id,
    prescription_type: row.prescription_type,
    params: row.params,
  }));
}

export function RoutineDraftEditorPage({
  isNewDraft = false,
}: RoutineDraftEditorPageProps = {}) {
  const paramsRoutineId = useParams().routineId ?? "";
  const [newDraftRoutineId, setNewDraftRoutineId] = useState("");
  const effectiveRoutineId = isNewDraft ? newDraftRoutineId : paramsRoutineId;
  const client = useRoutinesApi();
  const library = useExerciseLibraryApi();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const autoSave = useProgramAutoSave({ debounceMs: 400 });
  const [name, setName] = useState("");
  const [whoItsFor, setWhoItsFor] = useState("");
  const [conditionId, setConditionId] = useState<string | null>(null);
  const [bodyRegionId, setBodyRegionId] = useState<string | null>(null);
  const [bodyRegionOptions, setBodyRegionOptions] = useState<BodyRegionListItem[]>([]);
  const [rows, setRows] = useState<RoutineExerciseRow[]>([]);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [validationIssues, setValidationIssues] = useState<
    PublishValidationIssue[] | null
  >(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [newDraftBootstrap, setNewDraftBootstrap] = useState<NewDraftBootstrap | null>(
    null,
  );
  const [newDraftBootstrapFailed, setNewDraftBootstrapFailed] = useState(false);
  const hydratedRef = useRef(false);
  const createDraftPromiseRef = useRef<Promise<string> | null>(null);
  const newDraftSetupAbandonedRef = useRef(false);
  const newDraftSetupCompleteRef = useRef(false);
  const setupCancelDoneRef = useRef(false);
  const touchStateRef = useRef(true);

  const sessionEpoch = useSessionReadCacheEpoch();
  const sessionState = usePractitionerSession();
  const sessionReady = sessionState.status === "ready";
  const cacheKey =
    effectiveRoutineId.length > 0 && sessionEpoch
      ? routineDetailKey(sessionEpoch, effectiveRoutineId)
      : null;

  const {
    data: details,
    loading,
    loadFailed,
  } = useSessionCachedRead<DraftEditorSnapshot | null>({
    cacheKey,
    enabled: !isNewDraft && effectiveRoutineId.length > 0 && sessionReady,
    fetcher: async (signal) => {
      const [detailsResult, list] = await Promise.all([
        client.getRoutineDetails(effectiveRoutineId, { signal }),
        client.listMyRoutines({}, { signal }),
      ]);
      if (!detailsResult.is_draft) {
        return null;
      }
      return {
        ...detailsResult,
        condition_options: list.condition_options,
      };
    },
    retainOnError: true,
  });

  const draftDetails = details;

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    let cancelled = false;
    void client
      .listMeBodyRegions()
      .then((regions) => {
        if (!cancelled) {
          setBodyRegionOptions(regions);
        }
      })
      .catch(() => {
        /* unmount or test teardown */
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionReady]);

  useEffect(() => {
    if (!isNewDraft || !sessionReady) {
      return;
    }
    let cancelled = false;
    void client
      .listMyRoutines()
      .then((list) => {
        if (!cancelled) {
          setNewDraftBootstrap({
            conditions_available: list.conditions_available,
            condition_options: list.condition_options,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNewDraftBootstrapFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, isNewDraft, sessionReady]);

  useEffect(() => {
    if (!draftDetails || hydratedRef.current) {
      return;
    }
    setName(draftDetails.draft.name ?? "");
    setWhoItsFor(draftDetails.who_its_for ?? "");
    setConditionId(draftDetails.condition_id);
    setBodyRegionId(draftDetails.body_region_id);
    setRows(draftDetails.draft.rows);
    hydratedRef.current = true;
    autoSave.markSaved();
  }, [autoSave, draftDetails]);

  const conditionsAvailable = isNewDraft
    ? (newDraftBootstrap?.conditions_available ?? false)
    : (draftDetails?.conditions_available ?? false);
  const conditionOptions = isNewDraft
    ? (newDraftBootstrap?.condition_options ?? [])
    : (draftDetails?.condition_options ?? []);

  const draftAutosavePatch = useCallback(
    () => ({
      name: name.trim().length > 0 ? name.trim() : null,
      who_its_for: whoItsFor.trim().length > 0 ? whoItsFor.trim() : null,
      condition_id: conditionId,
      body_region_id: bodyRegionId!,
      rows: rowsPayload(rows),
    }),
    [bodyRegionId, conditionId, name, rows, whoItsFor],
  );

  const ensureServerDraft = useCallback(
    async (regionId: string): Promise<string> => {
      if (effectiveRoutineId.length > 0) {
        return effectiveRoutineId;
      }
      if (!isNewDraft) {
        return effectiveRoutineId;
      }
      if (!createDraftPromiseRef.current) {
        createDraftPromiseRef.current = client
          .createRoutineDraft({
            body_region_id: regionId,
            condition_id: conditionId,
            who_its_for: whoItsFor.trim().length > 0 ? whoItsFor.trim() : null,
            name: name.trim().length > 0 ? name.trim() : null,
          })
          .then((result) => {
            setNewDraftRoutineId(result.routine_id);
            return result.routine_id;
          });
      }
      return createDraftPromiseRef.current;
    },
    [client, conditionId, effectiveRoutineId, isNewDraft, name, whoItsFor],
  );

  const goToDraftEditUrl = useCallback(
    (routineId: string) => {
      if (!isNewDraft) {
        return;
      }
      if (newDraftSetupAbandonedRef.current) {
        return;
      }
      newDraftSetupCompleteRef.current = true;
      navigate(
        fillPhysioAppRoutePattern("routineDraftEdit", {
          routineId,
        }),
        { replace: true },
      );
    },
    [isNewDraft, navigate],
  );

  const persistPatch = useCallback(async (): Promise<string> => {
    if (!bodyRegionId) {
      return "";
    }
    const routineId =
      effectiveRoutineId.length > 0
        ? effectiveRoutineId
        : await ensureServerDraft(bodyRegionId);
    if (routineId.length === 0) {
      return "";
    }
    await client.autosaveRoutineDraft(routineId, draftAutosavePatch());
    autoSave.markSaved();
    return routineId;
  }, [
    autoSave,
    bodyRegionId,
    client,
    draftAutosavePatch,
    effectiveRoutineId,
    ensureServerDraft,
  ]);

  const scheduleSave = useCallback(() => {
    autoSave.scheduleDebouncedSave("draft", async () => {
      await persistPatch();
    });
  }, [autoSave, persistPatch]);

  const queueAutosave = useCallback(() => {
    if (!bodyRegionId) {
      return;
    }
    scheduleSave();
  }, [bodyRegionId, scheduleSave]);

  const untouched = isClientDraftUntouched({
    name,
    whoItsFor,
    conditionId,
    rowsCount: rows.length,
  });
  touchStateRef.current = untouched;

  const finalizeAbandonedNewDraftSetup = useCallback(() => {
    const promise = createDraftPromiseRef.current;
    if (!promise || setupCancelDoneRef.current) {
      return;
    }
    void promise
      .then((routineId) => {
        if (newDraftSetupCompleteRef.current) {
          return;
        }
        if (!newDraftSetupAbandonedRef.current) {
          return;
        }
        if (!touchStateRef.current) {
          return;
        }
        if (setupCancelDoneRef.current) {
          return;
        }
        setupCancelDoneRef.current = true;
        return client.cancelUntouchedRoutineDraft(routineId);
      })
      .catch(() => {
        /* draft create failed or page tore down */
      });
  }, [client]);

  useEffect(() => {
    if (!isNewDraft) {
      return;
    }
    return () => {
      if (newDraftSetupCompleteRef.current || newDraftSetupAbandonedRef.current) {
        return;
      }
      if (!createDraftPromiseRef.current) {
        return;
      }
      if (!touchStateRef.current) {
        newDraftSetupAbandonedRef.current = true;
        return;
      }
      newDraftSetupAbandonedRef.current = true;
      finalizeAbandonedNewDraftSetup();
    };
  }, [finalizeAbandonedNewDraftSetup, isNewDraft]);

  const draftHeading =
    name.trim().length === 0 && rows.length === 0 ? NEW_ROUTINE : EDIT_DRAFT;

  const persistRows = useCallback(
    async (next: RoutineExerciseRow[]) => {
      if (!bodyRegionId) {
        return;
      }
      const routineId =
        effectiveRoutineId.length > 0
          ? effectiveRoutineId
          : await ensureServerDraft(bodyRegionId);
      if (routineId.length === 0) {
        return;
      }
      await client.autosaveRoutineDraft(routineId, {
        name: name.trim().length > 0 ? name.trim() : null,
        who_its_for: whoItsFor.trim().length > 0 ? whoItsFor.trim() : null,
        condition_id: conditionId,
        body_region_id: bodyRegionId,
        rows: rowsPayload(next),
      });
      autoSave.markSaved();
    },
    [
      autoSave,
      bodyRegionId,
      client,
      conditionId,
      effectiveRoutineId,
      ensureServerDraft,
      name,
      whoItsFor,
    ],
  );

  const onRowsChange = (next: RoutineExerciseRow[]) => {
    setRows(next);
    if (!bodyRegionId) {
      return;
    }
    autoSave.scheduleDebouncedSave("rows", () => persistRows(next));
  };

  const onAddExercise = (exerciseId: string) => {
    setAddExerciseOpen(false);
    void library.getExerciseDetails(exerciseId).then((exerciseDetails) => {
      const nextRow = buildRoutineRowFromExerciseDetails(exerciseDetails, rows.length);
      const next = [...rows, nextRow];
      setRows(next);
      if (!bodyRegionId) {
        return;
      }
      void autoSave.runSave("add-exercise", () => persistRows(next));
    });
  };

  const onBodyRegionSelect = (regionId: string) => {
    setBodyRegionId(regionId);
    void ensureServerDraft(regionId)
      .then((routineId) => {
        if (newDraftSetupAbandonedRef.current) {
          return null;
        }
        return client
          .autosaveRoutineDraft(routineId, {
            name: name.trim().length > 0 ? name.trim() : null,
            who_its_for: whoItsFor.trim().length > 0 ? whoItsFor.trim() : null,
            condition_id: conditionId,
            body_region_id: regionId,
            rows: rowsPayload(rows),
          })
          .then(() => routineId);
      })
      .then((routineId) => {
        if (!routineId || newDraftSetupAbandonedRef.current) {
          return;
        }
        autoSave.markSaved();
        goToDraftEditUrl(routineId);
      })
      .catch(() => {
        /* setup abandoned or request failed after leave */
      });
  };

  const tryPublish = () => {
    setValidationIssues(null);
    setPublishOpen(true);
  };

  const onPublishConfirm = () => {
    setPublishBusy(true);
    void persistPatch()
      .then((routineId) => {
        if (routineId.length === 0) {
          throw new Error("Draft not created");
        }
        return client
          .publishRoutineDraft(routineId, { name: name.trim() })
          .then(() => routineId);
      })
      .then((routineId) => {
        setPublishOpen(false);
        showToast({ message: toastPublishedVersion1(name.trim()) });
        navigate(fillPhysioAppRoutePattern("routineDetail", { routineId }), {
          replace: true,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof RoutinesAuthoringError && error.validationIssues) {
          setValidationIssues(error.validationIssues);
          setPublishOpen(false);
          return;
        }
        setPublishOpen(false);
      })
      .finally(() => {
        setPublishBusy(false);
      });
  };

  const routinesListPath = fillPhysioAppRoutePattern("routines");

  const onLeave = () => {
    if (untouched) {
      if (isNewDraft) {
        newDraftSetupAbandonedRef.current = true;
      }
      if (effectiveRoutineId.length === 0) {
        if (isNewDraft && createDraftPromiseRef.current) {
          finalizeAbandonedNewDraftSetup();
        }
        navigate(routinesListPath, { replace: true });
        return;
      }
      void client.cancelUntouchedRoutineDraft(effectiveRoutineId).finally(() => {
        navigate(routinesListPath, { replace: true });
      });
      return;
    }
    void persistPatch().then((routineId) => {
      const path =
        routineId.length > 0
          ? fillPhysioAppRoutePattern("routineDetail", { routineId })
          : routinesListPath;
      navigate(path);
    });
  };

  const selectedBodyRegionLabel =
    bodyRegionOptions.find((option) => option.id === bodyRegionId)?.label ??
    draftDetails?.body_region_label ??
    "";
  const selectedConditionLabel =
    conditionOptions.find((option) => option.condition_id === conditionId)?.label ??
    draftDetails?.condition_label ??
    null;

  if (
    sessionState.status === "error" ||
    loadFailed ||
    newDraftBootstrapFailed ||
    (isNewDraft && newDraftBootstrap && bodyRegionOptions.length === 0)
  ) {
    return (
      <section className="ex-page rt-authoring">
        <ExerciseLibraryDetailErrorSlot />
      </section>
    );
  }

  const awaitingExistingDraft = !isNewDraft && (loading || !draftDetails);
  const awaitingNewDraft =
    isNewDraft &&
    (sessionState.status === "loading" ||
      newDraftBootstrap === null ||
      bodyRegionOptions.length === 0);

  if (awaitingExistingDraft || awaitingNewDraft) {
    return (
      <section className="ex-page rt-authoring" aria-busy>
        <ExerciseLibraryBusyState />
      </section>
    );
  }

  return (
    <section className="ex-page rt-authoring" aria-labelledby="rt-authoring-title">
      <Link
        to={fillPhysioAppRoutePattern("routines")}
        className="ex-back-link"
        onClick={(event) => {
          if (
            !isNewDraft ||
            !untouched ||
            (!createDraftPromiseRef.current && effectiveRoutineId.length === 0)
          ) {
            return;
          }
          event.preventDefault();
          newDraftSetupAbandonedRef.current = true;
          if (effectiveRoutineId.length === 0) {
            finalizeAbandonedNewDraftSetup();
          } else {
            void client.cancelUntouchedRoutineDraft(effectiveRoutineId);
          }
          navigate(routinesListPath, { replace: true });
        }}
      >
        {BACK_ROUTINES}
      </Link>
      <div className="rt-authoring-title-row">
        <h1 id="rt-authoring-title" className="ex-page-title">
          {draftHeading}
        </h1>
        <span className="rt-tag rt-tag--draft">{TAG_DRAFT}</span>
      </div>
      <RoutineAutoSaveStatus state={autoSave.state} />

      {validationIssues ? (
        <RoutinePublishValidationPanel issues={validationIssues} />
      ) : null}

      <div className="rt-authoring-form">
        <label className="ex-field">
          <span className="ex-field-label">{ROUTINE_NAME_LABEL}</span>
          <input
            type="text"
            className="ex-text-input"
            placeholder={ROUTINE_NAME_PLACEHOLDER}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              queueAutosave();
            }}
          />
          {name.trim().length === 0 ? (
            <span className="ex-field-note">{ADD_NAME_TO_PUBLISH}</span>
          ) : null}
        </label>

        {conditionsAvailable ? (
          <div className="ex-field">
            <div className="ex-field-label-row">
              <span className="ex-field-label">{CONDITION}</span>
              <span className="ex-sample-pill">{CONDITION_SAMPLE_LIST}</span>
            </div>
            <div className="ex-pill-row" role="group">
              {conditionOptions.map((option) => (
                <button
                  key={option.condition_id}
                  type="button"
                  className={`ex-pill${conditionId === option.condition_id ? " ex-pill--active" : ""}`}
                  onClick={() => {
                    const next =
                      conditionId === option.condition_id ? null : option.condition_id;
                    setConditionId(next);
                    queueAutosave();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="ex-field-note">{CONDITION_SAMPLE_NOTE}</p>
          </div>
        ) : null}

        <div className="ex-field">
          <span className="ex-field-label" id="rt-body-region-label">
            {BODY_REGION}
          </span>
          <div
            className="ex-pill-row"
            role="group"
            aria-labelledby="rt-body-region-label"
          >
            {bodyRegionOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`ex-pill${option.id === bodyRegionId ? " ex-pill--active" : ""}`}
                onClick={() => {
                  onBodyRegionSelect(option.id);
                }}
              >
                {capitalizeBodyRegionLabel(option.label)}
              </button>
            ))}
          </div>
        </div>

        <label className="ex-field">
          <span className="ex-field-label">
            {WHO_ITS_FOR_LABEL} {OPTIONAL_SUFFIX}
          </span>
          <textarea
            className="ex-text-input"
            rows={3}
            placeholder={WHO_ITS_FOR_PLACEHOLDER}
            value={whoItsFor}
            onChange={(event) => {
              setWhoItsFor(event.target.value);
              queueAutosave();
            }}
          />
          <span className="ex-field-note">{WHO_ITS_FOR_PRIVACY}</span>
        </label>
      </div>

      <div className="rt-authoring-exercises-panel">
        {rows.length === 0 ? (
          <p className="ex-muted">{NO_EXERCISES_ADD_FROM_LIBRARY}</p>
        ) : null}
        {rows.length > 0 ? (
          <RoutineAuthoringExerciseList rows={rows} onChange={onRowsChange} />
        ) : null}
        <button
          type="button"
          className="rt-add-exercise-btn"
          onClick={() => {
            setAddExerciseOpen(true);
          }}
        >
          + {ADD_EXERCISE}
        </button>
        {rows.length === 0 ? (
          <p className="ex-field-note">{ADD_AT_LEAST_ONE_EXERCISE_PUBLISH}</p>
        ) : null}
      </div>

      <div className="rt-authoring-actions">
        <button type="button" className="ex-secondary-btn" onClick={onLeave}>
          {untouched ? CANCEL : DONE_FOR_NOW}
        </button>
        <button
          type="button"
          className="ex-primary-btn"
          data-testid="rt-draft-publish"
          onClick={tryPublish}
        >
          {PUBLISH}
        </button>
      </div>

      <AddExerciseSheet
        open={addExerciseOpen}
        onClose={() => {
          setAddExerciseOpen(false);
        }}
        onPickExercise={onAddExercise}
        title={ADD_EXERCISE_TO_ROUTINE}
        subtitle={FROM_EXERCISE_LIBRARY}
      />

      <RoutinePublishSheet
        open={publishOpen}
        name={name}
        bodyRegionLabel={selectedBodyRegionLabel}
        conditionLabel={selectedConditionLabel}
        rows={rows}
        publishBusy={publishBusy}
        onClose={() => {
          setPublishOpen(false);
        }}
        onPublish={onPublishConfirm}
        onNotYet={() => {
          setPublishOpen(false);
          showToast({ message: KEPT_AS_DRAFT });
        }}
      />
    </section>
  );
}
