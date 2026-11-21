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

export function ExerciseRequestsListBusyState() {
  return (
    <SharedListLoadingState
      surface="requests"
      testId="exercise-requests-busy-skeleton"
    />
  );
}

export function ExerciseRequestItemBusyState() {
  return (
    <SharedItemLoadingState
      surface="requests"
      testId="exercise-request-detail-busy-skeleton"
    />
  );
}

export function ExerciseRequestItemLoadBanner({
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
        testId="exercise-request-detail-error-slot"
      />
    );
  }
  return (
    <SharedItemLoadErrorBanner
      item={itemTokenForSurface("requests")}
      onTryAgain={onTryAgain}
      testId="exercise-request-detail-error-slot"
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
