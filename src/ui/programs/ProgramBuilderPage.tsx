import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { ProgramBuilderView } from "../../services/programs/types.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { useProgramsApi } from "../api/programs-context.js";
import { useMinWidth1024 } from "../hooks/useMinWidth1024.js";
import { useToast } from "../components/Toast.js";
import { CANCEL } from "../copy/my-defaults.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import {
  ADD_EXERCISE,
  AUTO_SAVE_NOTE,
  BUILDER_EMPTY_ROWS,
  BUILDER_ROWS_HINT,
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
  programCodeChipLabel,
} from "../copy/programs.js";
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
import { resolveProgramIdForBuilderCode } from "./programs-list-utils.js";
import { useProgramAutoSave } from "./use-program-auto-save.js";
import { useProgramLeaveGuard } from "./program-leave-guard.js";

function noteDraftsFromProgram(program: ProgramBuilderView): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const row of program.rows) {
    drafts[row.id] = row.note ?? "";
  }
  return drafts;
}

export function ProgramBuilderPage() {
  const client = useProgramsApi();
  const navigate = useNavigate();
  const { programCode = "" } = useParams();
  const { showToast } = useToast();
  const [program, setProgram] = useState<ProgramBuilderView | null>(null);
  const programRef = useRef(program);
  programRef.current = program;
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const nameDraftRef = useRef(nameDraft);
  nameDraftRef.current = nameDraft;
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const noteDraftsRef = useRef(noteDrafts);
  noteDraftsRef.current = noteDrafts;
  const [rowMutationBusy, setRowMutationBusy] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingLeaveTo, setPendingLeaveTo] = useState<string | null>(null);
  const [redirectToList, setRedirectToList] = useState(false);

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
  const isDesktopLayout = useMinWidth1024();
  const { setGuard } = useProgramLeaveGuard();

  useEffect(() => {
    setGuard({
      hasUnsavedEdits: autoSave.hasUnsavedEdits,
      requestLeave: (to: string) => {
        setPendingLeaveTo(to);
        setLeaveOpen(true);
      },
    });
    return () => {
      setGuard(null);
    };
  }, [autoSave.hasUnsavedEdits, setGuard]);

  const loadProgram = useCallback(
    (programId: string) => {
      setLoading(true);
      setLoadFailed(false);
      void client
        .getProgram(programId)
        .then((view) => {
          setProgram(view);
          setNameDraft(view.name ?? "");
          setNoteDrafts(noteDraftsFromProgram(view));
          autoSaveRef.current.markSaved();
        })
        .catch(() => {
          setLoadFailed(true);
          setProgram(null);
        })
        .finally(() => {
          setLoading(false);
        });
    },
    [client],
  );

  useEffect(() => {
    const code = programCode.trim();
    if (code.length === 0) {
      setRedirectToList(true);
      return;
    }
    setLoading(true);
    void client
      .listPrograms(code)
      .then((result) => {
        const programId = resolveProgramIdForBuilderCode(result, code);
        if (!programId) {
          setRedirectToList(true);
          setLoading(false);
          return;
        }
        loadProgram(programId);
      })
      .catch(() => {
        setRedirectToList(true);
        setLoading(false);
      });
  }, [client, loadProgram, programCode]);

  const requestLeave = (to: string) => {
    if (autoSave.hasUnsavedEdits) {
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
      : undefined;

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
    void autoSave
      .runSave("add-exercise", async () => {
        const rowId = crypto.randomUUID();
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

  if (redirectToList) {
    return <Navigate to={fillPhysioAppRoutePattern("programs")} replace />;
  }

  if (loading) {
    return (
      <section className="pg-builder" aria-busy>
        <ProgramsBuilderBusyState />
      </section>
    );
  }

  if (!program && !loadFailed) {
    return null;
  }

  if (loadFailed || !program) {
    return (
      <section className="pg-builder">
        <ProgramsBuilderErrorSlot />
      </section>
    );
  }

  const rowActionsDisabled = rowMutationBusy;
  const publishStatusLine = formatAutoSaveStatus(program.auto_save_status, publishedAt);

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
      <p className="pg-code-chip">{programCodeChipLabel(program.code)}</p>
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
      <p className="pg-name-help">{builderNameHelpText(program.code)}</p>

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
                      program.program_id,
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
                      program.program_id,
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
          <h2 className="pg-exercises-heading">{EXERCISES_SECTION}</h2>
          <p className="pg-rows-hint">{BUILDER_ROWS_HINT}</p>
          {program.rows.length === 0 ? (
            <p className="pg-rows-empty">{BUILDER_EMPTY_ROWS}</p>
          ) : (
            <div className="pg-rows">
              {program.rows.map((row, index) => (
                <ProgramBuilderRowCard
                  key={row.id}
                  row={row}
                  index={index}
                  total={program.rows.length}
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
                          program.program_id,
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
                          program.program_id,
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
                          program.program_id,
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
          autoSaveStatus={program.auto_save_status}
          publishedAt={publishedAt}
          saveUiState={autoSave.state}
          failureAlertShown={autoSave.failureAlertShown}
          showFailureAlert={isDesktopLayout}
          publishAllowed={false}
          onTryAgain={autoSave.tryAgain}
        />
      </div>

      <BuilderPublishPhoneBar publishAllowed={false} />

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
        <DeleteProgramSheetBody program={program} />
      </ConfirmSheet>

      <LeaveWithoutSavingSheet
        open={leaveOpen}
        onKeepEditing={() => {
          setLeaveOpen(false);
          setPendingLeaveTo(null);
        }}
        onLeave={() => {
          setLeaveOpen(false);
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
