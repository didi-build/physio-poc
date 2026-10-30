import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { fillPhysioAppRoutePattern } from "../../app-routes.js";
import type { ProgramBuilderView } from "../../services/programs/types.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { useProgramsApi } from "../api/programs-context.js";
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
  programCodeChipLabel,
} from "../copy/programs.js";
import { AddExerciseSheet } from "./AddExerciseSheet.js";
import { AutoSaveStatus } from "./AutoSaveStatus.js";
import { BuilderPublishCard } from "./BuilderPublishCard.js";
import { LeaveWithoutSavingSheet } from "./LeaveWithoutSavingSheet.js";
import { LibraryUpdatePrompt } from "./LibraryUpdatePrompt.js";
import { ProgramBuilderRowCard } from "./ProgramBuilderRowCard.js";
import {
  ProgramsBuilderBusyState,
  ProgramsBuilderErrorSlot,
} from "./ProgramsStates.js";
import { resolveProgramIdForBuilderCode } from "./programs-list-utils.js";
import { useProgramAutoSave } from "./use-program-auto-save.js";

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
  const [rowBusy, setRowBusy] = useState(false);
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
    const trimmed = nameDraftRef.current.trim();
    const nextName = trimmed.length > 0 ? trimmed : null;
    if (nextName === current.name) {
      return;
    }
    const result = await client.updateProgramName(current.program_id, nextName);
    setProgram(result.program);
    setNameDraft(result.program.name ?? "");
  }, [client]);

  const autoSave = useProgramAutoSave({ save: saveName });
  const autoSaveRef = useRef(autoSave);
  autoSaveRef.current = autoSave;

  const loadProgram = useCallback(
    (programId: string) => {
      setLoading(true);
      setLoadFailed(false);
      void client
        .getProgram(programId)
        .then((view) => {
          setProgram(view);
          setNameDraft(view.name ?? "");
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
  }, [client, loadProgram, navigate, programCode]);

  const requestLeave = (to: string) => {
    if (autoSave.hasUnsavedEdits) {
      setPendingLeaveTo(to);
      setLeaveOpen(true);
      return;
    }
    navigate(to);
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

  const refreshProgram = (view: ProgramBuilderView) => {
    setProgram(view);
    setNameDraft(view.name ?? "");
  };

  const onNameChange = (value: string) => {
    setNameDraft(value);
    autoSave.markDirty();
  };

  const onAddExercise = (exerciseId: string) => {
    if (!program) {
      return;
    }
    setAddExerciseOpen(false);
    setRowBusy(true);
    const rowId = crypto.randomUUID();
    void client
      .addExerciseRow(program.program_id, {
        row_id: rowId,
        exercise_id: exerciseId,
      })
      .then((result) => {
        refreshProgram(result.program);
      })
      .finally(() => {
        setRowBusy(false);
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
    setRowBusy(true);
    void client
      .reorderRows(program.program_id, ids)
      .then((result) => {
        refreshProgram(result.program);
      })
      .finally(() => {
        setRowBusy(false);
      });
  };

  const onDeleteProgram = () => {
    if (!program) {
      return;
    }
    void client.deleteProgram(program.program_id).then((result) => {
      showToast({ message: deletedProgramToast(result.program.name) });
      setDeleteOpen(false);
      navigate(fillPhysioAppRoutePattern("programs"), { replace: true });
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

  return (
    <section className="pg-builder" aria-busy={rowBusy ? true : undefined}>
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
          <AutoSaveStatus
            state={autoSave.state}
            failureAlertShown={autoSave.failureAlertShown}
            onTryAgain={autoSave.tryAgain}
          />
          {libraryPrompts.map((prompt) => (
            <LibraryUpdatePrompt
              key={prompt.row_id}
              prompt={prompt}
              busy={rowBusy}
              onApply={() => {
                setRowBusy(true);
                void client
                  .applyLibraryUpdate(program.program_id, prompt.row_id)
                  .then((result) => {
                    refreshProgram(result.program);
                  })
                  .finally(() => {
                    setRowBusy(false);
                  });
              }}
              onKeep={() => {
                setRowBusy(true);
                void client
                  .keepLibraryUpdate(program.program_id, prompt.row_id)
                  .then((result) => {
                    refreshProgram(result.program);
                  })
                  .finally(() => {
                    setRowBusy(false);
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
                  busy={rowBusy}
                  onMoveUp={() => {
                    reorder(index, index - 1);
                  }}
                  onMoveDown={() => {
                    reorder(index, index + 1);
                  }}
                  onDuplicate={() => {
                    setRowBusy(true);
                    const newRowId = crypto.randomUUID();
                    void client
                      .duplicateRow(program.program_id, row.id, newRowId)
                      .then((result) => {
                        refreshProgram(result.program);
                        showToast({
                          message: duplicatedRowToast(row.text_snapshot.title),
                        });
                      })
                      .finally(() => {
                        setRowBusy(false);
                      });
                  }}
                  onRemove={() => {
                    setRowBusy(true);
                    void client
                      .deleteRow(program.program_id, row.id)
                      .then((result) => {
                        refreshProgram(result.program);
                      })
                      .finally(() => {
                        setRowBusy(false);
                      });
                  }}
                  onNoteChange={(note) => {
                    setRowBusy(true);
                    void client
                      .updateRow(program.program_id, row.id, {
                        note: note.length > 0 ? note : null,
                      })
                      .then((result) => {
                        refreshProgram(result.program);
                      })
                      .finally(() => {
                        setRowBusy(false);
                      });
                  }}
                  onTypeChange={(type: PrescriptionType) => {
                    setRowBusy(true);
                    void client
                      .updateRow(program.program_id, row.id, {
                        prescription_type: type,
                      })
                      .then((result) => {
                        refreshProgram(result.program);
                      })
                      .finally(() => {
                        setRowBusy(false);
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
          <p className="pg-footnote">{AUTO_SAVE_NOTE}</p>
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
          publishAllowed={autoSave.publishAllowed}
          onTryAgain={autoSave.tryAgain}
        />
      </div>

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
      />

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
