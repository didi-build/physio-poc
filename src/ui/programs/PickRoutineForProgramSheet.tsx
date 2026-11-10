import { useEffect, useId, useState } from "react";
import type {
  CommunityRoutineSummary,
  MyRoutineSavedItem,
} from "../../services/routines/types.js";
import { useRoutinesApi } from "../api/routines-context.js";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import { CANCEL } from "../copy/my-defaults.js";
import {
  CREATE_PROGRAM_FROM_ROUTINE_ACTION,
  NEW_PROGRAM_ROUTINE_PICKER_BODY,
  NEW_PROGRAM_ROUTINE_PICKER_TITLE,
} from "../copy/programs.js";
import {
  ExerciseLibraryBusyState,
  ExerciseLibraryListErrorSlot,
} from "../exercise-library/ExerciseLibraryStates.js";

export type PickRoutineForProgramSheetProps = {
  open: boolean;
  onClose: () => void;
  onPick: (routineId: string) => void;
  busy?: boolean;
};

type PickableRoutine = {
  routine_id: string;
  name: string;
  version_number: number;
  exercise_count: number;
};

function mapCommunity(item: CommunityRoutineSummary): PickableRoutine {
  return {
    routine_id: item.routine_id,
    name: item.name,
    version_number: item.version_number,
    exercise_count: item.exercise_count,
  };
}

function mapSaved(item: MyRoutineSavedItem): PickableRoutine {
  return {
    routine_id: item.routine_id,
    name: item.name,
    version_number: item.saved_copy_version,
    exercise_count: item.exercise_count,
  };
}

export function PickRoutineForProgramSheet({
  open,
  onClose,
  onPick,
  busy = false,
}: PickRoutineForProgramSheetProps) {
  const client = useRoutinesApi();
  const titleId = useId();
  const [routines, setRoutines] = useState<PickableRoutine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLoading(true);
    setLoadFailed(false);
    setSelectedId(null);
    void Promise.all([client.searchCommunity({ limit: 50 }), client.listMyRoutines({})])
      .then(([community, mine]) => {
        const byId = new Map<string, PickableRoutine>();
        for (const item of community.routines) {
          byId.set(item.routine_id, mapCommunity(item));
        }
        for (const item of mine.saved) {
          byId.set(item.routine_id, mapSaved(item));
        }
        setRoutines([...byId.values()]);
      })
      .catch(() => {
        setLoadFailed(true);
        setRoutines([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [client, open]);

  const selected = routines.find((item) => item.routine_id === selectedId) ?? null;

  return (
    <ConfirmSheet
      open={open}
      title={NEW_PROGRAM_ROUTINE_PICKER_TITLE}
      titleId={titleId}
      onClose={onClose}
      subtitle={NEW_PROGRAM_ROUTINE_PICKER_BODY}
      footer={
        <div className="pg-routine-pick-footer">
          <button type="button" className="pg-btn pg-btn--secondary" onClick={onClose}>
            {CANCEL}
          </button>
          <button
            type="button"
            className="pg-btn pg-btn--primary"
            disabled={!selected || busy}
            onClick={() => {
              if (selected) {
                onPick(selected.routine_id);
              }
            }}
          >
            {CREATE_PROGRAM_FROM_ROUTINE_ACTION}
          </button>
        </div>
      }
    >
      {loading ? <ExerciseLibraryBusyState /> : null}
      {loadFailed ? <ExerciseLibraryListErrorSlot /> : null}
      {!loading && !loadFailed ? (
        <ul className="pg-routine-pick-list" aria-busy={busy ? true : undefined}>
          {routines.map((routine) => (
            <li key={routine.routine_id}>
              <button
                type="button"
                className={`pg-routine-pick-item${
                  selectedId === routine.routine_id
                    ? " pg-routine-pick-item--selected"
                    : ""
                }`}
                aria-pressed={selectedId === routine.routine_id}
                onClick={() => {
                  setSelectedId(routine.routine_id);
                }}
              >
                <span className="pg-routine-pick-name">{routine.name}</span>
                <span className="pg-routine-pick-meta">
                  {routine.exercise_count} exercises · Version {routine.version_number}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </ConfirmSheet>
  );
}
