import { ConfirmSheet } from "../components/ConfirmSheet.js";
import type { RoutineVersionHistoryItem } from "../../services/routines/types.js";
import { CANCEL } from "../copy/my-defaults.js";
import { restoreAsVersion, restoreVersionConfirmTitle } from "../copy/routines.js";

export type RoutineRestoreConfirmSheetProps = {
  open: boolean;
  version: RoutineVersionHistoryItem | null;
  nextVersion: number;
  busy: boolean;
  cancelNote: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function RoutineRestoreConfirmSheet({
  open,
  version,
  nextVersion,
  busy,
  cancelNote,
  onClose,
  onConfirm,
}: RoutineRestoreConfirmSheetProps) {
  if (!version) {
    return null;
  }

  return (
    <ConfirmSheet
      open={open}
      title={restoreVersionConfirmTitle(version.version_number)}
      titleId="rt-restore-title"
      onClose={onClose}
      subtitle={cancelNote}
      footer={
        <div className="rt-sheet-footer">
          <button type="button" className="ex-secondary-btn" onClick={onClose}>
            {CANCEL}
          </button>
          <button
            type="button"
            className="ex-primary-btn"
            disabled={busy}
            data-testid="rt-restore-confirm"
            onClick={onConfirm}
          >
            {restoreAsVersion(nextVersion)}
          </button>
        </div>
      }
    >
      <p className="ex-muted">
        {version.exercise_count} exercises · {version.name}
      </p>
    </ConfirmSheet>
  );
}
