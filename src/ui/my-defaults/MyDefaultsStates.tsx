import { MY_DEFAULTS_PAGE_ERROR_MESSAGE } from "../copy/my-defaults-states.js";
import { ExerciseLibraryBusyState } from "../exercise-library/ExerciseLibraryStates.js";

export function MyDefaultsBusyState() {
  return <ExerciseLibraryBusyState />;
}

export function MyDefaultsErrorSlot() {
  if (typeof MY_DEFAULTS_PAGE_ERROR_MESSAGE !== "string") {
    return <div data-testid="my-defaults-error-slot" className="ex-error-slot" />;
  }
  return (
    <p className="ex-error" role="alert" data-testid="my-defaults-error-slot">
      {MY_DEFAULTS_PAGE_ERROR_MESSAGE}
    </p>
  );
}
