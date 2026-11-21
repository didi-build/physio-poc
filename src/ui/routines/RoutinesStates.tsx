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

export function RoutinesListBusyState({
  testId = "routines-list-busy-skeleton",
}: {
  testId?: string;
} = {}) {
  return <SharedListLoadingState surface="routines" testId={testId} />;
}

export function RoutinesItemBusyState({
  testId = "routines-item-busy-skeleton",
}: {
  testId?: string;
} = {}) {
  return <SharedItemLoadingState surface="routines" testId={testId} />;
}

export function RoutinesListLoadBanner({
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
        testId="routines-list-error-slot"
      />
    );
  }
  if (sharedInitialLoadFailed(hasContent, loadFailed)) {
    return (
      <SharedListLoadErrorBanner
        surface="routines"
        onTryAgain={onTryAgain}
        testId="routines-list-error-slot"
      />
    );
  }
  return null;
}

export function RoutinesItemLoadBanner({
  loadFailed,
  hasContent,
  onTryAgain,
  testId = "routines-item-error-slot",
}: {
  loadFailed: boolean;
  hasContent: boolean;
  onTryAgain: RetryHandler;
  testId?: string;
}) {
  if (!loadFailed) {
    return null;
  }
  if (sharedRefreshFailed(hasContent, loadFailed)) {
    return <SharedRefreshFailureBanner onTryAgain={onTryAgain} testId={testId} />;
  }
  return (
    <SharedItemLoadErrorBanner
      item={itemTokenForSurface("routines")}
      onTryAgain={onTryAgain}
      testId={testId}
    />
  );
}
