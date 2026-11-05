import { ConfirmSheet } from "../components/ConfirmSheet.js";
import {
  DAILY_LIMIT_REACHED,
  REGEN_DAILY_CAP,
  REGEN_NOTE_LABEL,
  REGEN_NOTE_OPTIONAL,
  REGEN_NOTE_PLACEHOLDER,
  REGEN_SCOPE_ALL_LABEL,
  REGEN_SCOPE_IMAGES_HINT,
  REGEN_SCOPE_IMAGES_LABEL,
  REGEN_SCOPE_VIDEO_HINT,
  REGEN_SCOPE_VIDEO_LABEL,
  REGEN_UNDO_HINT,
  REGENERATE_CHOOSE_HINT,
  REGENERATE_EVERYTHING,
  REGENERATE_IMAGES,
  REGENERATE_ONE_IMAGE_HINT,
  REGENERATE_END_IMAGE,
  REGENERATE_START_IMAGE,
  REGENERATE_SHEET_TITLE,
  REGENERATE_THIS_IMAGE,
  REGENERATE_VIDEO,
  WHAT_TO_REGENERATE,
  regenLeftText,
} from "../copy/exercise-requests.js";
import type { RegenerationQuota } from "../../services/exercise-media/exercise-media-service.js";
import type { MediaRegenerationScope } from "../../storage/repositories/exercise-media.js";

export type RegeneratePick = "all" | "images" | "video";

export type RegenerateMediaSheetProps = {
  open: boolean;
  onClose: () => void;
  mode: "general" | "start" | "end";
  quota: RegenerationQuota | null;
  note: string;
  onNoteChange: (value: string) => void;
  pick: RegeneratePick;
  onPickChange: (pick: RegeneratePick) => void;
  onConfirm: () => void;
  busy?: boolean;
};

export function RegenerateMediaSheet({
  open,
  onClose,
  mode,
  quota,
  note,
  onNoteChange,
  pick,
  onPickChange,
  onConfirm,
  busy = false,
}: RegenerateMediaSheetProps) {
  const remaining = quota?.remaining ?? REGEN_DAILY_CAP;
  const limitReached = quota?.limitReached ?? false;
  const subtitleParts = [
    mode === "start" || mode === "end"
      ? REGENERATE_ONE_IMAGE_HINT
      : REGENERATE_CHOOSE_HINT,
    regenLeftText(remaining),
  ];

  const confirmLabel =
    mode === "start" || mode === "end"
      ? REGENERATE_THIS_IMAGE
      : pick === "all"
        ? REGENERATE_EVERYTHING
        : pick === "images"
          ? REGENERATE_IMAGES
          : REGENERATE_VIDEO;

  return (
    <ConfirmSheet
      open={open}
      title={
        mode === "start"
          ? REGENERATE_START_IMAGE
          : mode === "end"
            ? REGENERATE_END_IMAGE
            : REGENERATE_SHEET_TITLE
      }
      titleId="ex-regen-sheet-title"
      subtitle={subtitleParts.join(" ")}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="ex-primary-btn ex-regen-confirm"
          disabled={limitReached || busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      }
    >
      {limitReached ? (
        <p className="ex-regen-limit" role="status">
          {DAILY_LIMIT_REACHED}
        </p>
      ) : null}
      {mode === "general" ? (
        <fieldset className="ex-regen-scopes">
          <legend className="sr-only">{WHAT_TO_REGENERATE}</legend>
          {(
            [
              ["all", REGEN_SCOPE_ALL_LABEL, ""],
              ["images", REGEN_SCOPE_IMAGES_LABEL, REGEN_SCOPE_IMAGES_HINT],
              ["video", REGEN_SCOPE_VIDEO_LABEL, REGEN_SCOPE_VIDEO_HINT],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className="ex-regen-scope-option">
              <input
                type="radio"
                name="regen-scope"
                checked={pick === id}
                onChange={() => {
                  onPickChange(id);
                }}
              />
              <span>
                <span className="ex-regen-scope-label">{label}</span>
                {hint ? <span className="ex-regen-scope-hint">{hint}</span> : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <label htmlFor="ex-regen-note" className="ex-request-field-label">
        {REGEN_NOTE_LABEL} <span className="ex-muted">{REGEN_NOTE_OPTIONAL}</span>
      </label>
      <textarea
        id="ex-regen-note"
        className="ex-textarea"
        rows={2}
        placeholder={REGEN_NOTE_PLACEHOLDER}
        value={note}
        onChange={(event) => {
          onNoteChange(event.target.value);
        }}
      />
      <p className="ex-regen-footnote">{REGEN_UNDO_HINT}</p>
    </ConfirmSheet>
  );
}

export function scopeForPick(pick: RegeneratePick): MediaRegenerationScope {
  if (pick === "images" || pick === "video") {
    return "both";
  }
  return "both";
}
