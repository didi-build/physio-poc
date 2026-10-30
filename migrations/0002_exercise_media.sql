CREATE TABLE IF NOT EXISTS exercise_media_sets (
  id TEXT PRIMARY KEY,
  start_object_key TEXT NOT NULL,
  end_object_key TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('draft', 'public')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_regenerations (
  id TEXT PRIMARY KEY,
  practitioner_id TEXT NOT NULL REFERENCES practitioners (id) ON DELETE RESTRICT,
  exercise_id TEXT NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  exercise_version_id TEXT REFERENCES exercise_versions (id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK (scope IN ('start', 'end', 'both')),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_regenerations_practitioner_created ON media_regenerations (
  practitioner_id,
  created_at
);
