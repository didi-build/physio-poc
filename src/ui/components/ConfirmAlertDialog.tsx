import { useEffect, useId, useRef, type ReactNode } from "react";
import { ARIA_CLOSE_SCRIM } from "../copy/a11y.js";

export type ConfirmAlertDialogProps = {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  describedByIds: string[];
  children?: ReactNode;
  footer: ReactNode;
  alerts?: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmAlertDialog({
  open,
  title,
  titleId,
  onClose,
  describedByIds,
  children,
  footer,
  alerts,
}: ConfirmAlertDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const describedBy = useId().replace(/:/g, "");

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;

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
    const focusTimer = window.requestAnimationFrame(() => {
      const footerEl = panelRef.current?.querySelector(".shell-dialog-footer");
      const cancelBtn = footerEl?.querySelector<HTMLElement>(
        'button[data-dialog-cancel="true"]',
      );
      (
        cancelBtn ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      )?.focus();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(focusTimer);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const ariaDescribedBy = [...describedByIds, describedBy].filter(Boolean).join(" ");

  return (
    <div className="shell-dialog-overlay" data-testid="confirm-alert-dialog-overlay">
      <button
        type="button"
        className="shell-sheet-scrim"
        aria-label={ARIA_CLOSE_SCRIM}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="shell-dialog-panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy || undefined}
      >
        <div className="shell-sheet-header">
          <h2 id={titleId} className="shell-sheet-title">
            {title}
          </h2>
        </div>
        {children ? <div className="shell-sheet-body">{children}</div> : null}
        {alerts ? (
          <div className="shell-dialog-alerts" id={describedBy}>
            {alerts}
          </div>
        ) : null}
        <div className="shell-dialog-footer shell-sheet-footer">{footer}</div>
      </div>
    </div>
  );
}
