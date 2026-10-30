import { useEffect, useRef, type ReactNode } from "react";
import { ARIA_CLOSE_SCRIM, ARIA_CLOSE_SHEET } from "../copy/a11y.js";

export type ConfirmSheetProps = {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  subtitle?: string;
  children?: ReactNode;
  footer: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CloseIcon() {
  return (
    <svg
      aria-hidden
      className="shell-sheet-close-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ConfirmSheet({
  open,
  title,
  titleId,
  onClose,
  subtitle,
  children,
  footer,
}: ConfirmSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }
      const focusables = [
        ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ];
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="shell-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="shell-sheet-scrim"
        aria-label={ARIA_CLOSE_SCRIM}
        tabIndex={-1}
        onClick={() => {
          onCloseRef.current();
        }}
      />
      <div ref={panelRef} className="shell-sheet-panel">
        <div className="shell-sheet-grab" aria-hidden />
        <div className="shell-sheet-header">
          <div>
            <h2 id={titleId} className="shell-sheet-title">
              {title}
            </h2>
            {subtitle ? <p className="shell-sheet-subtitle">{subtitle}</p> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="shell-sheet-close"
            aria-label={ARIA_CLOSE_SHEET}
            onClick={() => {
              onCloseRef.current();
            }}
          >
            <CloseIcon />
          </button>
        </div>
        {children ? <div className="shell-sheet-body">{children}</div> : null}
        <div className="shell-sheet-footer">{footer}</div>
      </div>
    </div>
  );
}
