CREATE TABLE IF NOT EXISTS conditions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0)
);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES practitioners (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  condition_id TEXT REFERENCES conditions (id) ON DELETE RESTRICT,
  body_region_id TEXT NOT NULL REFERENCES body_regions (id) ON DELETE RESTRICT,
  who_its_for TEXT,
  published_version INTEGER CHECK (
    published_version IS NULL OR published_version >= 1
  ),
  draft_updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_versions (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL CHECK (
    (status = 'draft' AND version_number = 0)
    OR (status = 'published' AND version_number >= 1)
  ),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  name TEXT,
  change_summary TEXT,
  restored_from_version_id TEXT REFERENCES routine_versions (id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES practitioners (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  UNIQUE (routine_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_versions_one_draft_per_routine ON routine_versions (routine_id)
WHERE
  status = 'draft';

CREATE TABLE IF NOT EXISTS routine_version_rows (
  id TEXT PRIMARY KEY,
  routine_version_id TEXT NOT NULL REFERENCES routine_versions (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  exercise_id TEXT NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  exercise_version_id TEXT NOT NULL REFERENCES exercise_versions (id) ON DELETE RESTRICT,
  prescription_type TEXT NOT NULL CHECK (
    prescription_type IN ('stretching', 'isometric', 'concentric', 'eccentric')
  ),
  params_json TEXT NOT NULL CHECK (json_valid(params_json)),
  UNIQUE (routine_version_id, position)
);

CREATE TABLE IF NOT EXISTS practitioner_routines (
  id TEXT PRIMARY KEY,
  practitioner_id TEXT NOT NULL REFERENCES practitioners (id) ON DELETE RESTRICT,
  routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE RESTRICT,
  source_routine_version_id TEXT NOT NULL REFERENCES routine_versions (id) ON DELETE RESTRICT,
  source_version_number INTEGER NOT NULL CHECK (source_version_number >= 1),
  saved_at TEXT NOT NULL,
  last_used_at TEXT,
  edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
  UNIQUE (practitioner_id, routine_id)
);

CREATE TABLE IF NOT EXISTS practitioner_routine_rows (
  id TEXT PRIMARY KEY,
  practitioner_routine_id TEXT NOT NULL REFERENCES practitioner_routines (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  exercise_id TEXT NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  exercise_version_id TEXT NOT NULL REFERENCES exercise_versions (id) ON DELETE RESTRICT,
  prescription_type TEXT NOT NULL CHECK (
    prescription_type IN ('stretching', 'isometric', 'concentric', 'eccentric')
  ),
  params_json TEXT NOT NULL CHECK (json_valid(params_json)),
  UNIQUE (practitioner_routine_id, position)
);

ALTER TABLE programs ADD COLUMN source_routine_id TEXT REFERENCES routines (id) ON DELETE RESTRICT;

ALTER TABLE programs ADD COLUMN source_routine_version_id TEXT REFERENCES routine_versions (id) ON DELETE RESTRICT;

ALTER TABLE programs ADD COLUMN source_routine_origin TEXT CHECK (
  source_routine_origin IS NULL
  OR source_routine_origin IN ('used_as_is', 'tweaked')
);
