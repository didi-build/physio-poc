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

export function ProgramsListBusyState() {
  return (
    <SharedListLoadingState surface="programs" testId="programs-list-busy-skeleton" />
  );
}

export function ProgramsBuilderBusyState() {
  return (
    <SharedItemLoadingState
      surface="programs"
      testId="programs-builder-busy-skeleton"
    />
  );
}

function ProgramsListLoadBanner({
  loadFailed,
  hasContent,
  onTryAgain,
  testId,
}: {
  loadFailed: boolean;
  hasContent: boolean;
  onTryAgain: RetryHandler;
  testId: string;
}) {
  if (!loadFailed) {
    return null;
  }
  if (sharedRefreshFailed(hasContent, loadFailed)) {
    return <SharedRefreshFailureBanner onTryAgain={onTryAgain} testId={testId} />;
  }
  if (sharedInitialLoadFailed(hasContent, loadFailed)) {
    return (
      <SharedListLoadErrorBanner
        surface="programs"
        onTryAgain={onTryAgain}
        testId={testId}
        className="pg-error-slot"
      />
    );
  }
  return null;
}

function ProgramsBuilderLoadBanner({
  loadFailed,
  hasContent,
  onTryAgain,
  testId,
}: {
  loadFailed: boolean;
  hasContent: boolean;
  onTryAgain: RetryHandler;
  testId: string;
}) {
  if (!loadFailed) {
    return null;
  }
  if (sharedRefreshFailed(hasContent, loadFailed)) {
    return <SharedRefreshFailureBanner onTryAgain={onTryAgain} testId={testId} />;
  }
  return (
    <SharedItemLoadErrorBanner
      item={itemTokenForSurface("programs")}
      onTryAgain={onTryAgain}
      testId={testId}
    />
  );
}

export function ProgramsListErrorSlot({
  loadFailed = true,
  hasContent = false,
  onTryAgain,
}: {
  loadFailed?: boolean;
  hasContent?: boolean;
  onTryAgain?: RetryHandler;
} = {}) {
  if (!onTryAgain) {
    return <div className="pg-error-slot" data-testid="programs-list-error-slot" />;
  }
  return (
    <ProgramsListLoadBanner
      loadFailed={loadFailed}
      hasContent={hasContent}
      onTryAgain={onTryAgain}
      testId="programs-list-error-slot"
    />
  );
}

export function ProgramsBuilderErrorSlot({
  loadFailed = true,
  hasContent = false,
  onTryAgain,
}: {
  loadFailed?: boolean;
  hasContent?: boolean;
  onTryAgain?: RetryHandler;
} = {}) {
  if (!onTryAgain) {
    return <div className="pg-error-slot" data-testid="programs-builder-error-slot" />;
  }
  return (
    <ProgramsBuilderLoadBanner
      loadFailed={loadFailed}
      hasContent={hasContent}
      onTryAgain={onTryAgain}
      testId="programs-builder-error-slot"
    />
  );
}
