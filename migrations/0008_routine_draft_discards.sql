-- Ephemeral discard tombstones: authorize undo_draft_discard only after discard_draft.

CREATE TABLE IF NOT EXISTS routine_draft_discards (
  routine_id TEXT PRIMARY KEY,
  practitioner_id TEXT NOT NULL REFERENCES practitioners (id) ON DELETE RESTRICT,
  draft_version_id TEXT NOT NULL,
  discarded_at TEXT NOT NULL
);
