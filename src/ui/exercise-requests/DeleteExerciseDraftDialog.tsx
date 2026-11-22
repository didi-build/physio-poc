import { useCallback, useId, useRef, useState } from "react";
import { CANCEL } from "../copy/exercise-requests.js";
import {
  DELETE_DRAFT,
  DELETE_DRAFT_ALREADY_APPROVED,
  DELETE_DRAFT_DIALOG_BODY_NO_UNDO,
  DELETE_DRAFT_DIALOG_BODY_OFF_LIST,
  DELETE_DRAFT_FAILED,
  deleteDraftDialogTitle,
} from "../copy/delete-exercise-draft.js";
import { ConfirmAlertDialog } from "../components/ConfirmAlertDialog.js";
import { ExerciseRequestsRequestError } from "../api/exercise-requests-client.js";
import { useExerciseRequestsApi } from "../api/exercise-requests-context.js";

export type DeleteExerciseDraftDialogProps = {
  open: boolean;
  requestId: string;
  title: string;
  onClose: () => void;
  onSuccess: () => void;
  onGenerationBlocked: () => void;
};

export function DeleteExerciseDraftDialog({
  open,
  requestId,
  title,
  onClose,
  onSuccess,
  onGenerationBlocked,
}: DeleteExerciseDraftDialogProps) {
  const client = useExerciseRequestsApi();
  const bodyOffListId = useId();
  const bodyNoUndoId = useId();
  const titleId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [failAlert, setFailAlert] = useState(false);
  const [approvedAlert, setApprovedAlert] = useState(false);
  const busyRef = useRef(false);

  const resetAlerts = useCallback(() => {
    setFailAlert(false);
    setApprovedAlert(false);
  }, []);

  const handleClose = useCallback(() => {
    if (busyRef.current) {
      return;
    }
    resetAlerts();
    onClose();
  }, [onClose, resetAlerts]);

  const confirmDelete = useCallback(async () => {
    if (busyRef.current || approvedAlert) {
      return;
    }
    busyRef.current = true;
    setSubmitting(true);
    setFailAlert(false);
    try {
      await client.withdrawRequest(requestId);
      resetAlerts();
      onSuccess();
    } catch (error) {
      if (error instanceof ExerciseRequestsRequestError) {
        if (
          error.detail.error === "request_not_deletable" ||
          error.detail.error === "request_already_approved"
        ) {
          setApprovedAlert(true);
          return;
        }
        if (error.detail.error === "draft_generation_in_progress") {
          resetAlerts();
          onClose();
          onGenerationBlocked();
          return;
        }
      }
      setFailAlert(true);
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [
    approvedAlert,
    client,
    onClose,
    onGenerationBlocked,
    onSuccess,
    requestId,
    resetAlerts,
  ]);

  return (
    <ConfirmAlertDialog
      open={open}
      title={deleteDraftDialogTitle(title)}
      titleId={titleId}
      onClose={handleClose}
      describedByIds={[bodyOffListId, bodyNoUndoId]}
      alerts={
        <>
          {failAlert ? (
            <p className="ex-delete-dialog-alert" role="alert">
              {DELETE_DRAFT_FAILED}
            </p>
          ) : null}
          {approvedAlert ? (
            <p className="ex-delete-dialog-alert" role="alert">
              {DELETE_DRAFT_ALREADY_APPROVED}
            </p>
          ) : null}
        </>
      }
      footer={
        <>
          <button
            type="button"
            className="ex-secondary-btn"
            data-dialog-cancel="true"
            disabled={submitting}
            onClick={handleClose}
          >
            {CANCEL}
          </button>
          {!approvedAlert ? (
            <button
              type="button"
              className="ex-delete-draft-btn ex-delete-draft-btn--dialog"
              disabled={submitting}
              onClick={() => {
                void confirmDelete();
              }}
            >
              {DELETE_DRAFT}
            </button>
          ) : null}
        </>
      }
    >
      <p id={bodyOffListId}>{DELETE_DRAFT_DIALOG_BODY_OFF_LIST}</p>
      <p id={bodyNoUndoId}>{DELETE_DRAFT_DIALOG_BODY_NO_UNDO}</p>
    </ConfirmAlertDialog>
  );
}
