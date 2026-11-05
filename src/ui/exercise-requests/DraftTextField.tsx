import { useEffect, useState } from "react";
import { CANCEL, SAVE, editFieldLabel } from "../copy/exercise-requests.js";

export type DraftTextFieldProps = {
  label: string;
  value: string;
  multiline?: boolean;
  onSave: (value: string) => Promise<void>;
};

export function DraftTextField({
  label,
  value,
  multiline = false,
  onSave,
}: DraftTextFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  if (!editing) {
    return (
      <div className="ex-draft-field">
        <div className="ex-draft-field-head">
          <span className="ex-draft-field-label">{label}</span>
          <button
            type="button"
            className="ex-link-btn"
            onClick={() => {
              setEditing(true);
            }}
          >
            {editFieldLabel(label)}
          </button>
        </div>
        <p className="ex-draft-field-value">{value || "\u00a0"}</p>
      </div>
    );
  }

  return (
    <div className="ex-draft-field ex-draft-field--editing">
      <label className="ex-draft-field-label" htmlFor={`draft-${label}`}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={`draft-${label}`}
          className="ex-textarea"
          rows={4}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
      ) : (
        <input
          id={`draft-${label}`}
          className="ex-input"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
        />
      )}
      <div className="ex-draft-field-actions">
        <button
          type="button"
          className="ex-primary-btn"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            void onSave(draft).finally(() => {
              setSaving(false);
              setEditing(false);
            });
          }}
        >
          {SAVE}
        </button>
        <button
          type="button"
          className="ex-secondary-btn"
          disabled={saving}
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
        >
          {CANCEL}
        </button>
      </div>
    </div>
  );
}
