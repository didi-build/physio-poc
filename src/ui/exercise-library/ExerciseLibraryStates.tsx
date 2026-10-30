import {
  EXERCISE_LIBRARY_DETAIL_ERROR_MESSAGE,
  EXERCISE_LIBRARY_LIST_ERROR_MESSAGE,
} from "../copy/exercise-library-states.js";

type ExerciseLibraryErrorSlotProps = {
  message: string | undefined;
  testId: string;
};

export function ExerciseLibraryErrorSlot({
  message,
  testId,
}: ExerciseLibraryErrorSlotProps) {
  if (typeof message !== "string" || message.length === 0) {
    return <div data-testid={testId} className="ex-error-slot" />;
  }
  return (
    <p className="ex-error" role="alert" data-testid={testId}>
      {message}
    </p>
  );
}

export function ExerciseLibraryDetailErrorSlot() {
  return (
    <ExerciseLibraryErrorSlot
      message={EXERCISE_LIBRARY_DETAIL_ERROR_MESSAGE}
      testId="exercise-library-detail-error-slot"
    />
  );
}

export function ExerciseLibraryListErrorSlot() {
  return (
    <ExerciseLibraryErrorSlot
      message={EXERCISE_LIBRARY_LIST_ERROR_MESSAGE}
      testId="exercise-library-list-error-slot"
    />
  );
}

export function ExerciseLibraryBusyState() {
  return (
    <div
      className="ex-busy"
      data-testid="exercise-library-busy-skeleton"
      aria-hidden="true"
    >
      <div className="ex-busy-skeleton ex-busy-skeleton--title" />
      <div className="ex-busy-skeleton ex-busy-skeleton--line" />
      <div className="ex-busy-skeleton ex-busy-skeleton--line ex-busy-skeleton--short" />
    </div>
  );
}
