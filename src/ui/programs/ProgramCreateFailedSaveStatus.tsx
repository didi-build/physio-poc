import { failedSaveItem } from "../copy/shared-load-states.js";
import { SharedFailedSaveAlert } from "../shared-load-states/SharedLoadStates.js";

/** First-save / create failure — same chrome as builder auto-save (Designer 064bb517). */
export function ProgramCreateFailedSaveStatus({
  onTryAgain,
  busy = false,
}: {
  onTryAgain: () => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <div className="pg-autosave" data-testid="program-create-failed-save">
      <SharedFailedSaveAlert
        message={failedSaveItem("program")}
        onTryAgain={onTryAgain}
        testId="program-create-failed-save-alert"
        retryDisabled={busy}
      />
    </div>
  );
}
