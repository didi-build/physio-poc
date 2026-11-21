import {
  SharedListLoadErrorBanner,
  SharedListLoadingState,
  SharedRefreshFailureBanner,
  sharedInitialLoadFailed,
  sharedRefreshFailed,
} from "../shared-load-states/SharedLoadStates.js";

type RetryHandler = () => void | Promise<void>;

export function MyDefaultsBusyState() {
  return (
    <SharedListLoadingState surface="defaults" testId="my-defaults-busy-skeleton" />
  );
}

export function MyDefaultsErrorSlot({
  loadFailed = true,
  hasContent = false,
  onTryAgain,
}: {
  loadFailed?: boolean;
  hasContent?: boolean;
  onTryAgain?: RetryHandler;
} = {}) {
  if (!onTryAgain) {
    return <div data-testid="my-defaults-error-slot" className="ex-error-slot" />;
  }
  if (!loadFailed) {
    return null;
  }
  if (sharedRefreshFailed(hasContent, loadFailed)) {
    return (
      <SharedRefreshFailureBanner
        onTryAgain={onTryAgain}
        testId="my-defaults-error-slot"
      />
    );
  }
  if (sharedInitialLoadFailed(hasContent, loadFailed)) {
    return (
      <SharedListLoadErrorBanner
        surface="defaults"
        onTryAgain={onTryAgain}
        testId="my-defaults-error-slot"
      />
    );
  }
  return null;
}
