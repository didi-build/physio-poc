import { failedSaveItem } from "../copy/shared-load-states.js";
import { AUTO_SAVE_TRY_AGAIN, AUTO_SAVE_TRY_AGAIN_ARIA } from "../copy/programs.js";

/** First-save / create failure — same chrome as builder auto-save (Designer 064bb517). */
export function ProgramCreateFailedSaveStatus({
  onTryAgain,
}: {
  onTryAgain: () => void | Promise<void>;
}) {
  return (
    <div className="pg-autosave" data-testid="program-create-failed-save">
      <p
        className="pg-autosave-alert"
        role="alert"
        data-testid="program-create-failed-save-alert"
      >
        {failedSaveItem("program")}
      </p>
      <button
        type="button"
        className="pg-btn pg-btn--secondary"
        aria-label={AUTO_SAVE_TRY_AGAIN_ARIA}
        onClick={() => {
          void Promise.resolve(onTryAgain());
        }}
      >
        {AUTO_SAVE_TRY_AGAIN}
      </button>
    </div>
  );
}
