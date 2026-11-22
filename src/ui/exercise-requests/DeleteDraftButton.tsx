import { useEffect, useId, useRef, useState } from "react";
import {
  DELETE_DRAFT,
  DELETE_DRAFT_BLOCKED_WHILE_GENERATING,
  deleteDraftRowAriaLabel,
} from "../copy/delete-exercise-draft.js";
import { DeleteExerciseDraftDialog } from "./DeleteExerciseDraftDialog.js";

export type DeleteDraftButtonProps = {
  requestId: string;
  title: string;
  generationInProgress: boolean;
  disabledReasonVisible?: boolean;
  listRow?: boolean;
  onSuccess: () => void;
  onGenerationBlocked?: () => void;
};

export function DeleteDraftButton({
  requestId,
  title,
  generationInProgress,
  disabledReasonVisible = false,
  listRow = false,
  onSuccess,
  onGenerationBlocked,
}: DeleteDraftButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showBlockedHint, setShowBlockedHint] = useState(disabledReasonVisible);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hintId = useId();

  const disabled = generationInProgress;
  const showHint = disabled || showBlockedHint;

  useEffect(() => {
    if (!generationInProgress && !disabledReasonVisible) {
      setShowBlockedHint(false);
    }
  }, [generationInProgress, disabledReasonVisible]);

  return (
    <>
      <div className={listRow ? "ex-requests-delete-wrap" : "ex-review-delete-wrap"}>
        <button
          ref={triggerRef}
          type="button"
          className="ex-delete-draft-btn"
          disabled={disabled}
          aria-describedby={showHint ? hintId : undefined}
          aria-label={listRow ? deleteDraftRowAriaLabel(title) : undefined}
          onClick={() => {
            setDialogOpen(true);
          }}
        >
          {DELETE_DRAFT}
        </button>
        {showHint ? (
          <p
            id={hintId}
            className="ex-delete-draft-blocked"
            role={showBlockedHint && !disabled ? "status" : undefined}
          >
            {DELETE_DRAFT_BLOCKED_WHILE_GENERATING}
          </p>
        ) : null}
      </div>
      <DeleteExerciseDraftDialog
        open={dialogOpen}
        requestId={requestId}
        title={title}
        onClose={() => {
          setDialogOpen(false);
          triggerRef.current?.focus();
        }}
        onSuccess={() => {
          setDialogOpen(false);
          onSuccess();
        }}
        onGenerationBlocked={() => {
          setShowBlockedHint(true);
          onGenerationBlocked?.();
        }}
      />
    </>
  );
}
