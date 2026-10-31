import { useEffect, useRef } from "react";
import { ConfirmSheet } from "../components/ConfirmSheet.js";
import {
  LEAVE_BODY,
  LEAVE_CONFIRM,
  LEAVE_KEEP_EDITING,
  LEAVE_TITLE,
} from "../copy/programs.js";

export type LeaveWithoutSavingSheetProps = {
  open: boolean;
  onKeepEditing: () => void;
  onLeave: () => void;
};

export function LeaveWithoutSavingSheet({
  open,
  onKeepEditing,
  onLeave,
}: LeaveWithoutSavingSheetProps) {
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      keepRef.current?.focus();
    }
  }, [open]);

  return (
    <ConfirmSheet
      open={open}
      title={LEAVE_TITLE}
      titleId="pg-leave-title"
      onClose={onKeepEditing}
      subtitle={LEAVE_BODY}
      footer={
        <>
          <button
            ref={keepRef}
            type="button"
            className="pg-btn pg-btn--primary"
            onClick={onKeepEditing}
          >
            {LEAVE_KEEP_EDITING}
          </button>
          <button type="button" className="pg-btn pg-btn--secondary" onClick={onLeave}>
            {LEAVE_CONFIRM}
          </button>
        </>
      }
    />
  );
}
