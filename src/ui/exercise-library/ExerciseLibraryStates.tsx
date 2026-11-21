import {
  SharedItemLoadErrorBanner,
  SharedItemLoadingState,
  SharedListLoadErrorBanner,
  SharedListLoadingState,
  SharedRefreshFailureBanner,
  itemTokenForSurface,
  sharedInitialLoadFailed,
  sharedRefreshFailed,
} from "../shared-load-states/SharedLoadStates.js";

type RetryHandler = () => void | Promise<void>;

export function ExerciseLibraryBusyState() {
  return (
    <SharedListLoadingState
      surface="exercises"
      testId="exercise-library-busy-skeleton"
    />
  );
}

export function ExerciseLibraryItemBusyState() {
  return (
    <SharedItemLoadingState
      surface="exercises"
      testId="exercise-library-busy-skeleton"
    />
  );
}

export function ExerciseLibraryListLoadBanner({
  loadFailed,
  hasContent,
  onTryAgain,
}: {
  loadFailed: boolean;
  hasContent: boolean;
  onTryAgain: RetryHandler;
}) {
  if (!loadFailed) {
    return null;
  }
  if (sharedRefreshFailed(hasContent, loadFailed)) {
    return (
      <SharedRefreshFailureBanner
        onTryAgain={onTryAgain}
        testId="exercise-library-list-error-slot"
      />
    );
  }
  if (sharedInitialLoadFailed(hasContent, loadFailed)) {
    return (
      <SharedListLoadErrorBanner
        surface="exercises"
        onTryAgain={onTryAgain}
        testId="exercise-library-list-error-slot"
      />
    );
  }
  return null;
}

/** @deprecated Use ExerciseLibraryListLoadBanner with onTryAgain. */
export function ExerciseLibraryListErrorSlot({
  onTryAgain,
}: {
  onTryAgain?: RetryHandler;
} = {}) {
  if (!onTryAgain) {
    return (
      <div data-testid="exercise-library-list-error-slot" className="ex-error-slot" />
    );
  }
  return (
    <SharedListLoadErrorBanner
      surface="exercises"
      onTryAgain={onTryAgain}
      testId="exercise-library-list-error-slot"
    />
  );
}

export function ExerciseLibraryDetailLoadBanner({
  loadFailed,
  hasContent,
  onTryAgain,
}: {
  loadFailed: boolean;
  hasContent: boolean;
  onTryAgain: RetryHandler;
}) {
  if (!loadFailed) {
    return null;
  }
  if (sharedRefreshFailed(hasContent, loadFailed)) {
    return (
      <SharedRefreshFailureBanner
        onTryAgain={onTryAgain}
        testId="exercise-library-detail-error-slot"
      />
    );
  }
  return (
    <SharedItemLoadErrorBanner
      item={itemTokenForSurface("exercises")}
      onTryAgain={onTryAgain}
      testId="exercise-library-detail-error-slot"
    />
  );
}

/** @deprecated Use ExerciseLibraryDetailLoadBanner. */
export function ExerciseLibraryDetailErrorSlot({
  onTryAgain,
}: {
  onTryAgain?: RetryHandler;
} = {}) {
  if (!onTryAgain) {
    return (
      <div data-testid="exercise-library-detail-error-slot" className="ex-error-slot" />
    );
  }
  return (
    <SharedItemLoadErrorBanner
      item={itemTokenForSurface("exercises")}
      onTryAgain={onTryAgain}
      testId="exercise-library-detail-error-slot"
    />
  );
}

export function ExerciseLibraryErrorSlot({
  message,
  testId,
}: {
  message: string | undefined;
  testId: string;
}) {
  if (typeof message !== "string" || message.length === 0) {
    return <div data-testid={testId} className="ex-error-slot" />;
  }
  return (
    <p className="ex-error" role="alert" data-testid={testId}>
      {message}
    </p>
  );
}
