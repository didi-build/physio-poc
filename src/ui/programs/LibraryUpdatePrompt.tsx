import type { ProgramLibraryUpdatePrompt } from "../../services/programs/types.js";
import {
  LIBRARY_UPDATE_BODY,
  LIBRARY_UPDATE_KEEP,
  libraryUpdateApplyLabel,
  libraryUpdateTitle,
} from "../copy/programs.js";

export type LibraryUpdatePromptProps = {
  prompt: ProgramLibraryUpdatePrompt;
  onApply: () => void;
  onKeep: () => void;
  busy?: boolean;
};

export function LibraryUpdatePrompt({
  prompt,
  onApply,
  onKeep,
  busy = false,
}: LibraryUpdatePromptProps) {
  return (
    <section
      className="pg-library-update"
      aria-label={libraryUpdateTitle(prompt.exercise_title)}
    >
      <h3 className="pg-library-update-title">
        {libraryUpdateTitle(prompt.exercise_title)}
      </h3>
      <p className="pg-library-update-body">{LIBRARY_UPDATE_BODY}</p>
      <div className="pg-library-update-actions">
        <button
          type="button"
          className="pg-btn pg-btn--primary"
          disabled={busy}
          onClick={onApply}
        >
          {libraryUpdateApplyLabel(prompt.latest_version_number)}
        </button>
        <button
          type="button"
          className="pg-btn pg-btn--secondary"
          disabled={busy}
          onClick={onKeep}
        >
          {LIBRARY_UPDATE_KEEP}
        </button>
      </div>
    </section>
  );
}
