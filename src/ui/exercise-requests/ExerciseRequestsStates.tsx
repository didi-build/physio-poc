import {
  SharedListLoadErrorBanner,
  SharedListLoadingState,
  SharedRefreshFailureBanner,
  sharedInitialLoadFailed,
  sharedRefreshFailed,
} from "../shared-load-states/SharedLoadStates.js";

type RetryHandler = () => void | Promise<void>;

export function ExerciseRequestsListBusyState() {
  return (
    <SharedListLoadingState
      surface="requests"
      testId="exercise-requests-busy-skeleton"
    />
  );
}

export function ExerciseRequestsListLoadBanner({
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
        testId="exercise-requests-list-error-slot"
      />
    );
  }
  if (sharedInitialLoadFailed(hasContent, loadFailed)) {
    return (
      <SharedListLoadErrorBanner
        surface="requests"
        onTryAgain={onTryAgain}
        testId="exercise-requests-list-error-slot"
      />
    );
  }
  return null;
}
