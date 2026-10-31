import { ExerciseLibraryBusyState } from "../exercise-library/ExerciseLibraryStates.js";

export function ProgramsListBusyState() {
  return <ExerciseLibraryBusyState />;
}

export function ProgramsListErrorSlot() {
  return <div className="pg-error-slot" />;
}

export function ProgramsBuilderBusyState() {
  return <ExerciseLibraryBusyState />;
}

export function ProgramsBuilderErrorSlot() {
  return <div className="pg-error-slot" />;
}
