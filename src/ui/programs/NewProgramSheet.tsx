import { ConfirmSheet } from "../components/ConfirmSheet.js";
import {
  NEW_PROGRAM_CHOOSER_INTRO,
  NEW_PROGRAM_FROM_SCRATCH,
  NEW_PROGRAM_SCRATCH_BLURB,
  NEW_PROGRAM_SHEET_TITLE,
} from "../copy/programs.js";

export type NewProgramSheetProps = {
  open: boolean;
  onClose: () => void;
  onFromScratch: () => void;
};

export function NewProgramSheet({
  open,
  onClose,
  onFromScratch,
}: NewProgramSheetProps) {
  return (
    <ConfirmSheet
      open={open}
      title={NEW_PROGRAM_SHEET_TITLE}
      titleId="pg-new-program-title"
      onClose={onClose}
      subtitle={NEW_PROGRAM_CHOOSER_INTRO}
      footer={
        <button type="button" className="pg-btn pg-btn--secondary" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <div className="pg-new-program-options">
        {/* From a routine: DIDI-853 (hidden until wired; no dead control). */}
        <button type="button" className="pg-new-program-option" onClick={onFromScratch}>
          <span className="pg-new-program-option-title">
            {NEW_PROGRAM_FROM_SCRATCH}
          </span>
          <span className="pg-new-program-option-body">
            {NEW_PROGRAM_SCRATCH_BLURB}
          </span>
        </button>
      </div>
    </ConfirmSheet>
  );
}
