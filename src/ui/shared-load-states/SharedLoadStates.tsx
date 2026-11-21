import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  LIST_LOAD_ERROR_SECONDARY,
  REFRESH_FAILURE_PRIMARY,
  TRYING_AGAIN,
  TRY_AGAIN,
  backToListLabel,
  itemLoadErrorPrimary,
  itemTokenForSurface,
  listLoadErrorPrimary,
  listTokenForSurface,
  loadingItemStatus,
  loadingListStatus,
  loadingListVisible,
  notFoundHelper,
  notFoundTitle,
  type LoadItemToken,
} from "../copy/shared-load-states.js";
export { itemTokenForSurface } from "../copy/shared-load-states.js";

export type SharedLoadSurface =
  "exercises" | "routines" | "programs" | "requests" | "defaults";

type TryAgainProps = {
  onTryAgain: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

function TryAgainButton({ onTryAgain, disabled, className }: TryAgainProps) {
  const [retrying, setRetrying] = useState(false);
  const busy = disabled || retrying;

  const onClick = useCallback(() => {
    if (busy) {
      return;
    }
    setRetrying(true);
    try {
      const result = onTryAgain();
      if (result instanceof Promise) {
        void result.finally(() => {
          setRetrying(false);
        });
      } else {
        setRetrying(false);
      }
    } catch {
      setRetrying(false);
    }
  }, [busy, onTryAgain]);

  return (
    <button
      type="button"
      className={className ?? "sls-try-again"}
      disabled={busy}
      onClick={onClick}
    >
      {busy ? TRYING_AGAIN : TRY_AGAIN}
    </button>
  );
}

function AlertBanner({
  primary,
  secondary,
  onTryAgain,
  testId,
  className,
}: {
  primary: string;
  secondary?: string;
  onTryAgain: () => void | Promise<void>;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={`sls-banner${className ? ` ${className}` : ""}`}
      role="alert"
      data-testid={testId}
    >
      <span className="sls-banner-icon" aria-hidden="true">
        !
      </span>
      <div className="sls-banner-body">
        <p className="sls-banner-primary">{primary}</p>
        {secondary ? <p className="sls-banner-secondary">{secondary}</p> : null}
      </div>
      <TryAgainButton
        onTryAgain={onTryAgain}
        className="sls-try-again sls-try-again--banner"
      />
    </div>
  );
}

export function SharedListLoadingState({
  surface,
  testId = "shared-load-list-loading",
}: {
  surface: SharedLoadSurface;
  testId?: string;
}) {
  const list = listTokenForSurface(surface);
  return (
    <div className="sls-list-loading" data-testid={testId}>
      <div className="sls-progress" aria-hidden="true">
        <div className="sls-progress-segment" />
      </div>
      <p className="sls-loading-visible" role="status">
        {loadingListVisible(list)}
      </p>
      <span className="sr-only">{loadingListStatus(list)}</span>
      <ul className="sls-skeleton-list" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="sls-skeleton-row">
            <div className="sls-skeleton-thumb" />
            <div className="sls-skeleton-lines">
              <div className="sls-skeleton-line sls-skeleton-line--title" />
              <div className="sls-skeleton-line" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SharedItemLoadingState({
  surface,
  testId = "shared-load-item-loading",
}: {
  surface: SharedLoadSurface;
  testId?: string;
}) {
  const item = itemTokenForSurface(
    surface as "exercises" | "routines" | "programs" | "requests",
  );
  return (
    <div className="sls-item-loading" data-testid={testId} aria-hidden="true">
      <p className="sr-only" role="status">
        {loadingItemStatus(item)}
      </p>
      <p className="ex-busy-skeleton ex-busy-skeleton--title" aria-hidden="true" />
      <p className="ex-busy-skeleton ex-busy-skeleton--line" aria-hidden="true" />
      <p
        className="ex-busy-skeleton ex-busy-skeleton--line ex-busy-skeleton--short"
        aria-hidden="true"
      />
    </div>
  );
}

export function SharedListLoadErrorBanner({
  surface,
  onTryAgain,
  testId,
  className,
}: {
  surface: SharedLoadSurface;
  onTryAgain: () => void | Promise<void>;
  testId?: string;
  className?: string;
}) {
  const list = listTokenForSurface(surface);
  return (
    <AlertBanner
      primary={listLoadErrorPrimary(list)}
      secondary={LIST_LOAD_ERROR_SECONDARY}
      onTryAgain={onTryAgain}
      testId={testId}
      className={className}
    />
  );
}

export function SharedRefreshFailureBanner({
  onTryAgain,
  testId,
}: {
  onTryAgain: () => void | Promise<void>;
  testId?: string;
}) {
  return (
    <AlertBanner
      primary={REFRESH_FAILURE_PRIMARY}
      onTryAgain={onTryAgain}
      testId={testId}
    />
  );
}

export function SharedItemLoadErrorBanner({
  item,
  onTryAgain,
  testId,
}: {
  item: LoadItemToken;
  onTryAgain: () => void | Promise<void>;
  testId?: string;
}) {
  return (
    <AlertBanner
      primary={itemLoadErrorPrimary(item)}
      secondary={LIST_LOAD_ERROR_SECONDARY}
      onTryAgain={onTryAgain}
      testId={testId}
    />
  );
}

export function SharedNotFoundState({
  item,
  surface,
  backHref,
  testId = "shared-load-not-found",
}: {
  item: LoadItemToken;
  surface: SharedLoadSurface;
  backHref: string;
  testId?: string;
}) {
  const backLabel = backToListLabel(listTokenForSurface(surface));
  return (
    <div className="sls-not-found" data-testid={testId}>
      <h1 className="sls-not-found-title">{notFoundTitle(item)}</h1>
      <p className="sls-not-found-helper">{notFoundHelper(item)}</p>
      <Link to={backHref} className="sls-back-button">
        {backLabel}
      </Link>
    </div>
  );
}

export function SharedItemBackLink({
  surface,
  href,
}: {
  surface: SharedLoadSurface;
  href: string;
}) {
  const label = backToListLabel(listTokenForSurface(surface));
  return (
    <Link to={href} className="ex-back-link sls-item-back">
      {label}
    </Link>
  );
}

export function SharedFailedSaveAlert({
  message,
  onTryAgain,
  testId = "shared-failed-save-alert",
}: {
  message: string;
  onTryAgain: () => void | Promise<void>;
  testId?: string;
}) {
  return (
    <div className="sls-failed-save" role="alert" data-testid={testId}>
      <p className="sls-failed-save-message">{message}</p>
      <TryAgainButton
        onTryAgain={onTryAgain}
        className="sls-back-button sls-failed-save-retry"
      />
    </div>
  );
}

export function sharedRefreshFailed(hasContent: boolean, loadFailed: boolean): boolean {
  return loadFailed && hasContent;
}

export function sharedInitialLoadFailed(
  hasContent: boolean,
  loadFailed: boolean,
): boolean {
  return loadFailed && !hasContent;
}
