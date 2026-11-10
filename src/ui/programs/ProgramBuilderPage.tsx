import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import type { ProgramShareConnectorView } from "../../services/programs/program-publish-service.js";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import {
  exerciseParamsEqual,
  filterExerciseParamsForPrescriptionType,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import type { ProgramBuilderView } from "../../services/programs/types.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { useProgramsApi } from "../api/programs-context.js";
import { programBuilderByCodeKey } from "../api/navigation-read-cache-keys.js";
import { usePractitionerSession } from "../api/practitioner-session-context.js";
import { useSessionReadCacheEpoch } from "../api/session-read-cache-context.js";
import { useSessionCachedRead } from "../hooks/use-session-cached-read.js";
import { useMinWidth1024 } from "../hooks/useMinWidth1024.js";
import { useToast } from "../components/Toast.js";
import { CANCEL } from "../copy/my-defaults.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import {
  ADD_EXERCISE,
  AUTO_SAVE_NOTE,
  BUILDER_EMPTY_ROWS,
  BUILDER_ROWS_HINT,
  exercisesSectionTotalCount,
  DELETE_PROGRAM,
  DELETE_PROGRAM_SHEET_TITLE,
  EXERCISES_SECTION,
  PROGRAM_NAME_LABEL,
  PROGRAMS_PAGE_TITLE,
  ROW_DEFAULTS_FOOTNOTE,
  builderNameHelpText,
  deletedProgramToast,
  duplicatedRowToast,
  formatAutoSaveStatus,
  PUBLISH,
} from "../copy/programs.js";
import {
  keptAsDraftToast,
  PUBLISHED_NEW_LINK_TOAST,
  PUBLISHED_SAME_LINK_TOAST,
  SHARE_LINK_BUTTON,
} from "../copy/program-publish.js";
import { PublishSheet } from "./PublishSheet.js";
import { AddExerciseSheet } from "./AddExerciseSheet.js";
import { AutoSaveStatus } from "./AutoSaveStatus.js";
import { BuilderPublishCard, BuilderPublishPhoneBar } from "./BuilderPublishCard.js";
import { DeleteProgramSheetBody } from "./DeleteProgramSheetBody.js";
import { LeaveWithoutSavingSheet } from "./LeaveWithoutSavingSheet.js";
import { LibraryUpdatePrompt } from "./LibraryUpdatePrompt.js";
import { ProgramBuilderRowCard } from "./ProgramBuilderRowCard.js";
import {
  ProgramsBuilderBusyState,
  ProgramsBuilderErrorSlot,
} from "./ProgramsStates.js";
import { useProgramAutoSave } from "./use-program-auto-save.js";
import { useProgramLeaveGuard } from "./program-leave-guard.js";
import { ProgramBuilderOriginBanner } from "./ProgramBuilderOriginBanner.js";

function noteDraftsFromProgram(program: ProgramBuilderView): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const row of program.rows) {
    drafts[row.id] = row.note ?? "";
  }
  return drafts;
}

export type ProgramBuilderPageProps = {
  publishSheetOpen?: boolean;
};

export function ProgramBuilderPage({
  publishSheetOpen = false,
}: ProgramBuilderPageProps) {
  const client = useProgramsApi();
  const navigate = useNavigate();
  const location = useLocation();
  const { programCode = "" } = useParams();
  const { showToast } = useToast();
  const [program, setProgram] = useState<ProgramBuilderView | null>(null);
  const programRef = useRef(program);
  programRef.current = program;
  const [loadFailed, setLoadFailed] = useState(false);
  const sessionEpoch = useSessionReadCacheEpoch();
  const sessionReady = usePractitionerSession().status === "ready";
  const [nameDraft, setNameDraft] = useState("");
  const nameDraftRef = useRef(nameDraft);
  nameDraftRef.current = nameDraft;
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const noteDraftsRef = useRef(noteDrafts);
  noteDraftsRef.current = noteDrafts;
  const [rowMutationBusy, setRowMutationBusy] = useState(false);
  const [doseAdjustDraft, setDoseAdjustDraft] = useState<{
    rowId: string;
    params: ExerciseParams;
  } | null>(null);
  const doseAdjustDraftRef = useRef(doseAdjustDraft);
  doseAdjustDraftRef.current = doseAdjustDraft;
  const [doseEditorRowId, setDoseEditorRowId] = useState<string | null>(null);
  const doseEditorRowIdRef = useRef(doseEditorRowId);
  doseEditorRowIdRef.current = doseEditorRowId;
  const doseParamDebounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  /** Bumped on each dose draft edit per row so late PATCH responses cannot overwrite a newer draft. */
  const doseParamsEditGenRef = useRef<Map<string, number>>(new Map());
  /** Row params PATCH in flight: used to force a corrective PATCH when the draft reverts while an older value is still saving. */
  const doseParamsInflightRef = useRef<
    Map<string, { sentFiltered: ExerciseParams; editGenWhenSent: number }>
  >(new Map());
  /** Last params confirmed by the server for a row (before any client merge of stale responses). */
  const doseServerConfirmedFilteredRef = useRef<Map<string, ExerciseParams>>(new Map());
  /** Serializes dose PATCH per row so auto and flush cannot complete out of order on the client. */
  const doseRowParamsWriteChainRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingLeaveTo, setPendingLeaveTo] = useState<string | null>(null);
  const [redirectToList, setRedirectToList] = useState(false);
  const [shareView, setShareView] = useState<ProgramShareConnectorView | null>(null);
  const [publishOpen, setPublishOpen] = useState(publishSheetOpen);

  const saveName = useCallback(async () => {
    const current = programRef.current;
    if (!current) {
      return;
    }
    const draftAtSaveStart = nameDraftRef.current;
    const trimmed = draftAtSaveStart.trim();
    const nextName = trimmed.length > 0 ? trimmed : null;
    if (nextName === current.name) {
      return;
    }
    const result = await client.updateProgramName(current.program_id, nextName);
    setProgram(result.program);
    if (nameDraftRef.current === draftAtSaveStart) {
      setNameDraft(result.program.name ?? "");
    }
  }, [client]);

  const autoSave = useProgramAutoSave({});
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;

  const doseDraftDiffersFromServer = useMemo(() => {
    if (!program || doseAdjustDraft === null) {
      return false;
    }
    const row = program.rows.find((r) => r.id === doseAdjustDraft.rowId);
    if (!row) {
      return false;
    }
    const draftFiltered = filterExerciseParamsForPrescriptionType(
      doseAdjustDraft.params,
      row.prescription_type,
    );
    const storedFiltered = filterExerciseParamsForPrescriptionType(
      { ...row.params },
      row.prescription_type,
    );
    return !exerciseParamsEqual(draftFiltered, storedFiltered);
  }, [program, doseAdjustDraft]);
  const isDesktopLayout = useMinWidth1024();
  const { setGuard } = useProgramLeaveGuard();

  useEffect(() => {
    setGuard({
      hasUnsavedEdits: autoSave.hasUnsavedEdits || doseDraftDiffersFromServer,
      requestLeave: (to: string) => {
        setPendingLeaveTo(to);
        setLeaveOpen(true);
      },
    });
    return () => {
      setGuard(null);
    };
  }, [autoSave.hasUnsavedEdits, doseDraftDiffersFromServer, setGuard]);

  const trimmedProgramCode = programCode.trim();
  const builderCacheKey =
    trimmedProgramCode.length > 0 && sessionEpoch
      ? programBuilderByCodeKey(sessionEpoch, trimmedProgramCode)
      : null;

  const {
    data: cachedProgram,
    loading,
    loadFailed: builderLoadFailed,
  } = useSessionCachedRead<ProgramBuilderView>({
    cacheKey: builderCacheKey,
    enabled: trimmedProgramCode.length > 0 && sessionReady,
    fetcher: (signal) => client.getProgramByCode(trimmedProgramCode, { signal }),
    retainOnError: true,
  });

  useLayoutEffect(() => {
    if (trimmedProgramCode.length === 0) {
      setRedirectToList(true);
      return;
    }
    if (builderLoadFailed) {
      setRedirectToList(true);
      setProgram(null);
      setLoadFailed(true);
      return;
    }
    if (!cachedProgram) {
      return;
    }
    setRedirectToList(false);
    setLoadFailed(false);
    setProgram(cachedProgram);
    setNameDraft(cachedProgram.name ?? "");
    setNoteDrafts(noteDraftsFromProgram(cachedProgram));
    doseServerConfirmedFilteredRef.current.clear();
    for (const r of cachedProgram.rows) {
      doseServerConfirmedFilteredRef.current.set(
        r.id,
        filterExerciseParamsForPrescriptionType({ ...r.params }, r.prescription_type),
      );
    }
    autoSaveRef.current.markSaved();
  }, [builderLoadFailed, cachedProgram, trimmedProgramCode]);

  useEffect(() => {
    setDoseAdjustDraft(null);
    doseAdjustDraftRef.current = null;
    setDoseEditorRowId(null);
    doseEditorRowIdRef.current = null;
    for (const t of doseParamDebounceTimersRef.current.values()) {
      clearTimeout(t);
    }
    doseParamDebounceTimersRef.current.clear();
    doseParamsEditGenRef.current.clear();
    doseParamsInflightRef.current.clear();
    doseServerConfirmedFilteredRef.current.clear();
    doseRowParamsWriteChainRef.current.clear();
  }, [program?.program_id]);

  const requestLeave = (to: string) => {
    if (autoSave.hasUnsavedEdits || doseDraftDiffersFromServer) {
      setPendingLeaveTo(to);
      setLeaveOpen(true);
      return;
    }
    navigate(to);
  };

  const applyProgram = (view: ProgramBuilderView) => {
    setProgram(view);
  };

  const publishedAt =
    program?.auto_save_status.kind === "published"
      ? program.auto_save_status.published_at
      : (shareView?.published_at ?? undefined);

  const refreshShareView = useCallback(async () => {
    const current = programRef.current;
    if (!current) {
      return;
    }
    const view = await client.getShareLink(current.program_id);
    setShareView(view);
  }, [client]);

  useEffect(() => {
    if (!sessionReady || !program) {
      return;
    }
    void refreshShareView().catch(() => {
      /* share metadata is optional for builder rendering */
    });
  }, [program?.program_id, refreshShareView, sessionReady]);

  useEffect(() => {
    setPublishOpen(publishSheetOpen);
  }, [publishSheetOpen]);

  useEffect(() => {
    const state = location.state as { openPublishSheet?: boolean } | null;
    if (state?.openPublishSheet) {
      setPublishOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const libraryPrompts = useMemo(
    () =>
      program?.rows
        .map((row) => row.library_update)
        .filter((value): value is NonNullable<typeof value> => value !== null) ?? [],
    [program?.rows],
  );

  const onNameChange = (value: string) => {
    setNameDraft(value);
    autoSave.scheduleDebouncedSave("name", saveName);
  };

  const saveRowParamsSnapshot = useCallback(
    async (rowId: string, attemptParams: ExerciseParams) => {
      const prevLink =
        doseRowParamsWriteChainRef.current.get(rowId) ?? Promise.resolve();
      const runPromise = (async () => {
        await prevLink.catch(() => {});
        const currentProgram = programRef.current;
        if (!currentProgram) {
          return;
        }
        const targetRow = currentProgram.rows.find((r) => r.id === rowId);
        if (!targetRow) {
          return;
        }
        const editGenWhenQueued = doseParamsEditGenRef.current.get(rowId) ?? 0;
        const nextParams = filterExerciseParamsForPrescriptionType(
          attemptParams,
          targetRow.prescription_type,
        );
        const storedFiltered =
          doseServerConfirmedFilteredRef.current.get(rowId) ??
          filterExerciseParamsForPrescriptionType(
            { ...targetRow.params },
            targetRow.prescription_type,
          );
        const inflight = doseParamsInflightRef.current.get(rowId);
        const inflightStale =
          inflight !== undefined &&
          !exerciseParamsEqual(inflight.sentFiltered, nextParams);
        if (exerciseParamsEqual(nextParams, storedFiltered) && !inflightStale) {
          return;
        }
        setRowMutationBusy(true);
        doseParamsInflightRef.current.set(rowId, {
          sentFiltered: nextParams,
          editGenWhenSent: editGenWhenQueued,
        });
        try {
          const result = await client.updateRow(currentProgram.program_id, rowId, {
            params: nextParams,
          });
          const rawUpdated = result.program.rows.find((r) => r.id === rowId);
          if (rawUpdated !== undefined) {
            doseServerConfirmedFilteredRef.current.set(
              rowId,
              filterExerciseParamsForPrescriptionType(
                { ...rawUpdated.params },
                rawUpdated.prescription_type,
              ),
            );
          }
          const genAfterResponse = doseParamsEditGenRef.current.get(rowId) ?? 0;
          let programToApply = result.program;
          if (genAfterResponse > editGenWhenQueued) {
            const draft = doseAdjustDraftRef.current;
            const prevRow = programRef.current?.rows.find((r) => r.id === rowId);
            const updated = result.program.rows.find((r) => r.id === rowId);
            if (updated !== undefined) {
              const replacementParams =
                draft?.rowId === rowId
                  ? filterExerciseParamsForPrescriptionType(
                      draft.params,
                      updated.prescription_type,
                    )
                  : prevRow !== undefined
                    ? filterExerciseParamsForPrescriptionType(
                        { ...prevRow.params },
                        updated.prescription_type,
                      )
                    : undefined;
              if (replacementParams !== undefined) {
                programToApply = {
                  ...result.program,
                  rows: result.program.rows.map((r) =>
                    r.id === rowId ? { ...updated, params: replacementParams } : r,
                  ),
                };
              }
            }
          }
          applyProgram(programToApply);
          setDoseAdjustDraft((prev) => {
            if (doseEditorRowIdRef.current !== rowId) {
              return prev;
            }
            if (prev?.rowId !== rowId) {
              return prev;
            }
            const updated = programToApply.rows.find((r) => r.id === rowId);
            if (!updated) {
              return prev;
            }
            const serverFiltered = filterExerciseParamsForPrescriptionType(
              { ...updated.params },
              updated.prescription_type,
            );
            const prevDraftFiltered = filterExerciseParamsForPrescriptionType(
              prev.params,
              updated.prescription_type,
            );
            if (!exerciseParamsEqual(prevDraftFiltered, serverFiltered)) {
              doseAdjustDraftRef.current = prev;
              return prev;
            }
            const synced = {
              rowId,
              params: serverFiltered,
            };
            doseAdjustDraftRef.current = synced;
            return synced;
          });
        } finally {
          const mark = doseParamsInflightRef.current.get(rowId);
          if (mark !== undefined && mark.editGenWhenSent === editGenWhenQueued) {
            doseParamsInflightRef.current.delete(rowId);
          }
          setRowMutationBusy(false);
        }
      })();
      doseRowParamsWriteChainRef.current.set(
        rowId,
        runPromise.catch(() => {}),
      );
      await runPromise;
    },
    [client],
  );

  const saveRowParamsIfChanged = useCallback(
    async (rowId: string) => {
      const snap = doseAdjustDraftRef.current;
      if (snap?.rowId !== rowId) {
        return;
      }
      await saveRowParamsSnapshot(rowId, snap.params);
    },
    [saveRowParamsSnapshot],
  );

  const scheduleDoseParamSave = useCallback(
    (rowId: string) => {
      const existing = doseParamDebounceTimersRef.current.get(rowId);
      if (existing) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        doseParamDebounceTimersRef.current.delete(rowId);
        void autoSaveRef.current.runSave(`row-params:auto:${rowId}`, () =>
          saveRowParamsIfChanged(rowId),
        );
      }, 100);
      doseParamDebounceTimersRef.current.set(rowId, timer);
    },
    [saveRowParamsIfChanged],
  );

  const onNoteChange = (rowId: string, note: string) => {
    setNoteDrafts((prev) => ({ ...prev, [rowId]: note }));
    autoSave.scheduleDebouncedSave(`note:${rowId}`, async () => {
      const current = programRef.current;
      if (!current) {
        return;
      }
      const noteAtSave = noteDraftsRef.current[rowId] ?? "";
      const result = await client.updateRow(current.program_id, rowId, {
        note: noteAtSave.length > 0 ? noteAtSave : null,
      });
      applyProgram(result.program);
      setNoteDrafts((prev) => {
        const serverNote = result.program.rows.find((r) => r.id === rowId)?.note ?? "";
        if (prev[rowId] === noteAtSave) {
          return { ...prev, [rowId]: serverNote };
        }
        return prev;
      });
    });
  };

  const onAddExercise = (exerciseId: string) => {
    if (!program) {
      return;
    }
    setAddExerciseOpen(false);
    setRowMutationBusy(true);
    const rowId = crypto.randomUUID();
    const saveKey = `add-exercise:${rowId}`;
    void autoSave
      .runSave(saveKey, async () => {
        const result = await client.addExerciseRow(program.program_id, {
          row_id: rowId,
          exercise_id: exerciseId,
        });
        applyProgram(result.program);
        setNoteDrafts(noteDraftsFromProgram(result.program));
      })
      .finally(() => {
        setRowMutationBusy(false);
      });
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    if (!program || fromIndex === toIndex) {
      return;
    }
    const ids = program.rows.map((row) => row.id);
    const [moved] = ids.splice(fromIndex, 1);
    if (!moved) {
      return;
    }
    ids.splice(toIndex, 0, moved);
    setRowMutationBusy(true);
    void autoSave
      .runSave("reorder-rows", async () => {
        const result = await client.reorderRows(program.program_id, ids);
        applyProgram(result.program);
      })
      .finally(() => {
        setRowMutationBusy(false);
      });
  };

  const onDeleteProgram = () => {
    if (!program) {
      return;
    }
    void client
      .deleteProgram(program.program_id)
      .then((result) => {
        showToast({ message: deletedProgramToast(result.program.name) });
        setDeleteOpen(false);
        navigate(fillPhysioAppRoutePattern("programs"), { replace: true });
      })
      .catch(() => {
        setDeleteOpen(false);
      });
  };

  const builderView = program ?? cachedProgram ?? null;
  const showBuilderLoading = loading && builderView === null;

  if (redirectToList) {
    return <Navigate to={fillPhysioAppRoutePattern("programs")} replace />;
  }

  if (showBuilderLoading) {
    return (
      <section className="pg-builder" aria-busy>
        <ProgramsBuilderBusyState />
      </section>
    );
  }

  if (!builderView && !loadFailed) {
    return null;
  }

  if (loadFailed || !builderView) {
    return (
      <section className="pg-builder">
        <ProgramsBuilderErrorSlot />
      </section>
    );
  }

  const displayProgram = program ?? builderView;

  const rowActionsDisabled = rowMutationBusy;
  const publishStatusLine = formatAutoSaveStatus(
    displayProgram.auto_save_status,
    publishedAt,
  );

  const pendingChanges = displayProgram.auto_save_status.kind === "unpublished_changes";
  const publishMode =
    pendingChanges || displayProgram.auto_save_status.kind === "not_published_yet";
  const primaryLabel = publishMode ? PUBLISH : SHARE_LINK_BUTTON;
  const openPublish = () => {
    navigate(
      fillPhysioAppRoutePattern("programPublish", {
        programCode: displayProgram.code,
      }),
    );
    setPublishOpen(true);
  };
  const openShare = () => {
    navigate(
      fillPhysioAppRoutePattern("programShare", {
        programCode: displayProgram.code,
      }),
    );
  };
  const onPublishPrimary = () => {
    if (publishMode) {
      openPublish();
      return;
    }
    openShare();
  };
  const showNameOnPublishSheet =
    displayProgram.auto_save_status.kind === "not_published_yet" ||
    !(displayProgram.name ?? "").trim();

  return (
    <section className="pg-builder" aria-busy={rowMutationBusy ? true : undefined}>
      <button
        type="button"
        className="ex-back-link"
        onClick={() => {
          requestLeave(fillPhysioAppRoutePattern("programs"));
        }}
      >
        {PROGRAMS_PAGE_TITLE}
      </button>
      <p className="pg-code-chip">{displayProgram.code}</p>
      <label className="pg-name-field">
        <span id="pg-program-name-label">{PROGRAM_NAME_LABEL}</span>
        <input
          type="text"
          aria-labelledby="pg-program-name-label"
          value={nameDraft}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
        />
      </label>
      <p className="pg-name-help">{builderNameHelpText(displayProgram.code)}</p>

      {displayProgram.routine_origin ? (
        <ProgramBuilderOriginBanner origin={displayProgram.routine_origin} />
      ) : null}

      <div className="pg-builder-layout">
        <div className="pg-builder-main">
          <div className="pg-builder-status-card pg-builder-status-card--phone">
            <p className="pg-publish-card-status">{publishStatusLine}</p>
            <AutoSaveStatus
              className="pg-autosave--phone"
              state={autoSave.state}
              failureAlertShown={autoSave.failureAlertShown}
              showFailureAlert={!isDesktopLayout}
              onTryAgain={autoSave.tryAgain}
            />
          </div>
          <p className="pg-autosave-page-note">{AUTO_SAVE_NOTE}</p>
          {libraryPrompts.map((prompt) => (
            <LibraryUpdatePrompt
              key={prompt.row_id}
              prompt={prompt}
              busy={rowActionsDisabled}
              onApply={() => {
                setRowMutationBusy(true);
                void autoSave
                  .runSave(`apply-library:${prompt.row_id}`, async () => {
                    const result = await client.applyLibraryUpdate(
                      displayProgram.program_id,
                      prompt.row_id,
                    );
                    applyProgram(result.program);
                  })
                  .finally(() => {
                    setRowMutationBusy(false);
                  });
              }}
              onKeep={() => {
                setRowMutationBusy(true);
                void autoSave
                  .runSave(`keep-library:${prompt.row_id}`, async () => {
                    const result = await client.keepLibraryUpdate(
                      displayProgram.program_id,
                      prompt.row_id,
                    );
                    applyProgram(result.program);
                  })
                  .finally(() => {
                    setRowMutationBusy(false);
                  });
              }}
            />
          ))}
          <div className="pg-exercises-heading-row">
            <h2 className="pg-exercises-heading">{EXERCISES_SECTION}</h2>
            <p className="pg-exercises-total">
              {exercisesSectionTotalCount(displayProgram.rows.length)}
            </p>
          </div>
          <p className="pg-rows-hint">
            <svg
              className="pg-rows-hint-grip"
              aria-hidden
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="currentColor"
            >
              <circle cx="9" cy="7" r="1.5" />
              <circle cx="15" cy="7" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="17" r="1.5" />
              <circle cx="15" cy="17" r="1.5" />
            </svg>
            {BUILDER_ROWS_HINT}
          </p>
          {displayProgram.rows.length === 0 ? (
            <p className="pg-rows-empty">{BUILDER_EMPTY_ROWS}</p>
          ) : (
            <div className="pg-rows">
              {displayProgram.rows.map((row, index) => (
                <ProgramBuilderRowCard
                  key={row.id}
                  row={row}
                  index={index}
                  total={displayProgram.rows.length}
                  noteDraft={noteDrafts[row.id] ?? row.note ?? ""}
                  actionsDisabled={rowActionsDisabled}
                  onMoveUp={() => {
                    reorder(index, index - 1);
                  }}
                  onMoveDown={() => {
                    reorder(index, index + 1);
                  }}
                  onDuplicate={() => {
                    setRowMutationBusy(true);
                    const newRowId = crypto.randomUUID();
                    void autoSave
                      .runSave(`duplicate-row:${row.id}`, async () => {
                        const result = await client.duplicateRow(
                          displayProgram.program_id,
                          row.id,
                          newRowId,
                        );
                        applyProgram(result.program);
                        setNoteDrafts(noteDraftsFromProgram(result.program));
                        showToast({
                          message: duplicatedRowToast(row.text_snapshot.title),
                        });
                      })
                      .finally(() => {
                        setRowMutationBusy(false);
                      });
                  }}
                  onRemove={() => {
                    setRowMutationBusy(true);
                    void autoSave
                      .runSave(`delete-row:${row.id}`, async () => {
                        const result = await client.deleteRow(
                          displayProgram.program_id,
                          row.id,
                        );
                        applyProgram(result.program);
                        setNoteDrafts(noteDraftsFromProgram(result.program));
                      })
                      .finally(() => {
                        setRowMutationBusy(false);
                      });
                  }}
                  onNoteChange={(note) => {
                    onNoteChange(row.id, note);
                  }}
                  onTypeChange={(type: PrescriptionType) => {
                    setRowMutationBusy(true);
                    void autoSave
                      .runSave(`row-type:${row.id}`, async () => {
                        const result = await client.updateRow(
                          displayProgram.program_id,
                          row.id,
                          {
                            prescription_type: type,
                          },
                        );
                        applyProgram(result.program);
                      })
                      .finally(() => {
                        setRowMutationBusy(false);
                      });
                  }}
                  onSelectVersion={(versionNumber) => {
                    if (
                      row.kind !== "exercise" ||
                      row.pinned_version_number === versionNumber
                    ) {
                      return;
                    }
                    const versionId = row.exercise_version_choices.find(
                      (choice) => choice.version_number === versionNumber,
                    )?.exercise_version_id;
                    if (!versionId) {
                      return;
                    }
                    setRowMutationBusy(true);
                    void autoSave
                      .runSave(`row-version:${row.id}`, async () => {
                        const result = await client.updateRow(
                          displayProgram.program_id,
                          row.id,
                          {
                            exercise_version_id: versionId,
                          },
                        );
                        applyProgram(result.program);
                        setNoteDrafts(noteDraftsFromProgram(result.program));
                      })
                      .finally(() => {
                        setRowMutationBusy(false);
                      });
                  }}
                  doseDraft={
                    doseAdjustDraft?.rowId === row.id
                      ? doseAdjustDraft.params
                      : undefined
                  }
                  doseEditorOpen={doseEditorRowId === row.id}
                  onDoseAdjustOpen={() => {
                    void (async () => {
                      const prevId = doseEditorRowIdRef.current;
                      if (prevId && prevId !== row.id) {
                        const prevTimer =
                          doseParamDebounceTimersRef.current.get(prevId);
                        if (prevTimer) {
                          clearTimeout(prevTimer);
                          doseParamDebounceTimersRef.current.delete(prevId);
                        }
                        const closingDraft = doseAdjustDraftRef.current;
                        if (closingDraft?.rowId === prevId) {
                          await saveRowParamsSnapshot(prevId, closingDraft.params);
                        }
                        setDoseAdjustDraft(null);
                        doseAdjustDraftRef.current = null;
                      }
                      setDoseEditorRowId(row.id);
                      doseEditorRowIdRef.current = row.id;
                      const rowSnap = programRef.current?.rows.find(
                        (r) => r.id === row.id,
                      );
                      if (!rowSnap) {
                        return;
                      }
                      const initial = {
                        rowId: row.id,
                        params: filterExerciseParamsForPrescriptionType(
                          { ...rowSnap.params },
                          rowSnap.prescription_type,
                        ),
                      };
                      setDoseAdjustDraft(initial);
                      doseAdjustDraftRef.current = initial;
                      doseParamsEditGenRef.current.set(
                        row.id,
                        (doseParamsEditGenRef.current.get(row.id) ?? 0) + 1,
                      );
                    })();
                  }}
                  onDoseDraftChange={(draft: ExerciseParams) => {
                    const nextDraft = { rowId: row.id, params: draft };
                    setDoseAdjustDraft(nextDraft);
                    doseAdjustDraftRef.current = nextDraft;
                    doseParamsEditGenRef.current.set(
                      row.id,
                      (doseParamsEditGenRef.current.get(row.id) ?? 0) + 1,
                    );
                    scheduleDoseParamSave(row.id);
                  }}
                  onDoseAdjustClose={() => {
                    const timer = doseParamDebounceTimersRef.current.get(row.id);
                    if (timer) {
                      clearTimeout(timer);
                      doseParamDebounceTimersRef.current.delete(row.id);
                    }
                    const currentProgram = programRef.current;
                    const targetRow = currentProgram?.rows.find((r) => r.id === row.id);
                    const draftSnap = doseAdjustDraftRef.current;
                    let paramsSnapshot: ExerciseParams | null = null;
                    if (targetRow && draftSnap?.rowId === row.id) {
                      const next = filterExerciseParamsForPrescriptionType(
                        draftSnap.params,
                        targetRow.prescription_type,
                      );
                      const storedFiltered =
                        doseServerConfirmedFilteredRef.current.get(row.id) ??
                        filterExerciseParamsForPrescriptionType(
                          { ...targetRow.params },
                          targetRow.prescription_type,
                        );
                      const inflight = doseParamsInflightRef.current.get(row.id);
                      const inflightStale =
                        inflight !== undefined &&
                        !exerciseParamsEqual(inflight.sentFiltered, next);
                      if (!exerciseParamsEqual(next, storedFiltered) || inflightStale) {
                        paramsSnapshot = { ...draftSnap.params };
                      }
                    }
                    setDoseEditorRowId((current) =>
                      current === row.id ? null : current,
                    );
                    if (doseEditorRowIdRef.current === row.id) {
                      doseEditorRowIdRef.current = null;
                    }
                    if (paramsSnapshot !== null) {
                      const snapshot = paramsSnapshot;
                      setRowMutationBusy(true);
                      void autoSaveRef.current
                        .runSave(`row-params:flush:${row.id}`, () =>
                          saveRowParamsSnapshot(row.id, snapshot),
                        )
                        .finally(() => {
                          setRowMutationBusy(false);
                          setDoseAdjustDraft((prev) =>
                            prev?.rowId === row.id ? null : prev,
                          );
                          if (doseAdjustDraftRef.current?.rowId === row.id) {
                            doseAdjustDraftRef.current = null;
                          }
                        });
                      return;
                    }
                    setDoseAdjustDraft((prev) =>
                      prev?.rowId === row.id ? null : prev,
                    );
                    if (doseAdjustDraftRef.current?.rowId === row.id) {
                      doseAdjustDraftRef.current = null;
                    }
                  }}
                  onDoseDraftDiscard={() => {
                    const timer = doseParamDebounceTimersRef.current.get(row.id);
                    if (timer) {
                      clearTimeout(timer);
                      doseParamDebounceTimersRef.current.delete(row.id);
                    }
                    setDoseAdjustDraft((prev) =>
                      prev?.rowId === row.id ? null : prev,
                    );
                    if (doseAdjustDraftRef.current?.rowId === row.id) {
                      doseAdjustDraftRef.current = null;
                    }
                  }}
                  onParamsReset={() => {
                    const timer = doseParamDebounceTimersRef.current.get(row.id);
                    if (timer) {
                      clearTimeout(timer);
                      doseParamDebounceTimersRef.current.delete(row.id);
                    }
                    setDoseAdjustDraft((prev) =>
                      prev?.rowId === row.id ? null : prev,
                    );
                    if (doseAdjustDraftRef.current?.rowId === row.id) {
                      doseAdjustDraftRef.current = null;
                    }
                    setDoseEditorRowId((current) =>
                      current === row.id ? null : current,
                    );
                    if (doseEditorRowIdRef.current === row.id) {
                      doseEditorRowIdRef.current = null;
                    }
                    setRowMutationBusy(true);
                    void autoSave
                      .runSave(`row-params-reset:${row.id}`, async () => {
                        const result = await client.updateRow(
                          displayProgram.program_id,
                          row.id,
                          { params: row.resolved_params },
                        );
                        applyProgram(result.program);
                        const updated = result.program.rows.find(
                          (r) => r.id === row.id,
                        );
                        if (updated && doseAdjustDraftRef.current?.rowId === row.id) {
                          const synced = {
                            rowId: row.id,
                            params: filterExerciseParamsForPrescriptionType(
                              { ...updated.params },
                              updated.prescription_type,
                            ),
                          };
                          doseAdjustDraftRef.current = synced;
                          setDoseAdjustDraft(synced);
                        }
                      })
                      .finally(() => {
                        setRowMutationBusy(false);
                      });
                  }}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            className="pg-btn pg-btn--primary"
            onClick={() => {
              setAddExerciseOpen(true);
            }}
          >
            {ADD_EXERCISE}
          </button>
          <p className="pg-footnote">{ROW_DEFAULTS_FOOTNOTE}</p>
          <button
            type="button"
            className="pg-btn pg-btn--danger"
            onClick={() => {
              setDeleteOpen(true);
            }}
          >
            {DELETE_PROGRAM}
          </button>
        </div>
        <BuilderPublishCard
          autoSaveStatus={displayProgram.auto_save_status}
          publishedAt={publishedAt ?? null}
          shareLinkStatus={displayProgram.share_link_status}
          saveUiState={autoSave.state}
          failureAlertShown={autoSave.failureAlertShown}
          showFailureAlert={isDesktopLayout}
          publishAllowed={autoSave.publishAllowed}
          primaryDisabled={displayProgram.rows.length === 0}
          primaryLabel={primaryLabel}
          pendingChanges={pendingChanges}
          expiryLine={shareView?.share_link_status === "closed" ? "Link closed" : null}
          showLinkSettings={displayProgram.share_link_status !== "none"}
          onPrimary={onPublishPrimary}
          onLinkSettings={openShare}
          onTryAgain={autoSave.tryAgain}
        />
      </div>

      <BuilderPublishPhoneBar
        publishAllowed={autoSave.publishAllowed}
        primaryDisabled={displayProgram.rows.length === 0}
        primaryLabel={primaryLabel}
        onPrimary={onPublishPrimary}
      />

      <AddExerciseSheet
        open={addExerciseOpen}
        onClose={() => {
          setAddExerciseOpen(false);
        }}
        onPickExercise={onAddExercise}
      />

      <ConfirmSheet
        open={deleteOpen}
        title={DELETE_PROGRAM_SHEET_TITLE}
        titleId="pg-delete-title"
        onClose={() => {
          setDeleteOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className="pg-btn pg-btn--secondary"
              onClick={() => {
                setDeleteOpen(false);
              }}
            >
              {CANCEL}
            </button>
            <button
              type="button"
              className="pg-btn pg-btn--danger"
              onClick={onDeleteProgram}
            >
              {DELETE_PROGRAM}
            </button>
          </>
        }
      >
        <DeleteProgramSheetBody program={displayProgram} />
      </ConfirmSheet>

      <PublishSheet
        open={publishOpen}
        program={displayProgram}
        shareView={shareView}
        client={client}
        nameDraft={nameDraft}
        showNameField={showNameOnPublishSheet}
        onNameChange={onNameChange}
        onProgramUpdated={(updated) => {
          applyProgram(updated);
        }}
        onClose={() => {
          setPublishOpen(false);
          if (publishSheetOpen) {
            navigate(
              fillPhysioAppRoutePattern("programBuilder", {
                programCode: displayProgram.code,
              }),
              { replace: true },
            );
          }
        }}
        onNotYet={() => {
          setPublishOpen(false);
          if (displayProgram.auto_save_status.kind === "not_published_yet") {
            showToast({
              message: keptAsDraftToast(displayProgram.code),
            });
          }
          if (publishSheetOpen) {
            navigate(
              fillPhysioAppRoutePattern("programBuilder", {
                programCode: displayProgram.code,
              }),
              { replace: true },
            );
          }
        }}
        onPublished={({ program: nextProgram, newLink }) => {
          applyProgram(nextProgram);
          void refreshShareView();
          setPublishOpen(false);
          showToast({
            message: newLink ? PUBLISHED_NEW_LINK_TOAST : PUBLISHED_SAME_LINK_TOAST,
          });
          if (publishSheetOpen) {
            navigate(
              fillPhysioAppRoutePattern("programBuilder", {
                programCode: displayProgram.code,
              }),
              { replace: true },
            );
          }
        }}
        onRemovePlaceholder={(rowId) => {
          setRowMutationBusy(true);
          void client
            .deleteRow(displayProgram.program_id, rowId)
            .then((result) => {
              applyProgram(result.program);
            })
            .finally(() => {
              setRowMutationBusy(false);
            });
        }}
      />

      <LeaveWithoutSavingSheet
        open={leaveOpen}
        onKeepEditing={() => {
          setLeaveOpen(false);
          setPendingLeaveTo(null);
        }}
        onLeave={async () => {
          setLeaveOpen(false);
          for (const t of doseParamDebounceTimersRef.current.values()) {
            clearTimeout(t);
          }
          doseParamDebounceTimersRef.current.clear();
          const leaveDraft = doseAdjustDraftRef.current;
          if (leaveDraft !== null) {
            await saveRowParamsSnapshot(leaveDraft.rowId, leaveDraft.params);
          }
          autoSave.markSaved();
          if (pendingLeaveTo) {
            navigate(pendingLeaveTo);
          }
          setPendingLeaveTo(null);
        }}
      />
    </section>
  );
}
