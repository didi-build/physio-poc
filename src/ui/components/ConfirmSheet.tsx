import { useEffect, type ReactNode } from "react";

export type ConfirmSheetProps = {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  subtitle?: string;
  children?: ReactNode;
  footer: ReactNode;
};

export function ConfirmSheet({
  open,
  title,
  titleId,
  onClose,
  subtitle,
  children,
  footer,
}: ConfirmSheetProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

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
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="shell-sheet-panel">
        <div className="shell-sheet-grab" aria-hidden />
        <div className="shell-sheet-header">
          <div>
            <h2 id={titleId} className="shell-sheet-title">
              {title}
            </h2>
            {subtitle ? <p className="shell-sheet-subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="shell-sheet-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children ? <div className="shell-sheet-body">{children}</div> : null}
        <div className="shell-sheet-footer">{footer}</div>
      </div>
    </div>
  );
}
