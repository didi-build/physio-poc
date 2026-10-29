CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practitioners (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('stretch', 'strengthening')),
  created_by TEXT NOT NULL REFERENCES practitioners (id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise_versions (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises (id),
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved')),
  approved_by TEXT REFERENCES practitioners (id),
  approved_at TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  equipment TEXT NOT NULL DEFAULT '',
  starting_position TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '',
  common_mistakes TEXT NOT NULL DEFAULT '',
  regressions TEXT NOT NULL DEFAULT '',
  progressions TEXT NOT NULL DEFAULT '',
  precautions TEXT NOT NULL DEFAULT '',
  cue_stretching TEXT,
  cue_isometric TEXT,
  cue_concentric TEXT,
  cue_eccentric TEXT,
  media_set_id TEXT,
  change_summary TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (exercise_id, version_number),
  CHECK (length(trim(title)) BETWEEN 1 AND 80),
  CHECK (
    (status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (status = 'draft' AND approved_by IS NULL AND approved_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS exercise_aliases (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises (id),
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_aliases_alias ON exercise_aliases (
  alias COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS body_regions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS exercise_body_regions (
  exercise_id TEXT NOT NULL REFERENCES exercises (id),
  body_region_id TEXT NOT NULL REFERENCES body_regions (id),
  PRIMARY KEY (exercise_id, body_region_id)
);

CREATE TABLE IF NOT EXISTS exercise_requests (
  id TEXT PRIMARY KEY,
  requested_name TEXT NOT NULL CHECK (length(trim(requested_name)) >= 1),
  note TEXT,
  requested_by TEXT NOT NULL REFERENCES practitioners (id),
  status TEXT NOT NULL CHECK (
    status IN ('open', 'drafting', 'approved', 'withdrawn')
  ),
  exercise_id TEXT REFERENCES exercises (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS type_defaults (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'practitioner')),
  practitioner_id TEXT REFERENCES practitioners (id),
  type TEXT NOT NULL CHECK (
    type IN ('stretching', 'isometric', 'concentric', 'eccentric')
  ),
  params_json TEXT NOT NULL,
  CHECK (
    (scope = 'global' AND practitioner_id IS NULL)
    OR (scope = 'practitioner' AND practitioner_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_type_defaults_global_type ON type_defaults (type)
WHERE
  scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_type_defaults_practitioner_type ON type_defaults (practitioner_id, type)
WHERE
  scope = 'practitioner';

CREATE TABLE IF NOT EXISTS practitioner_exercises (
  practitioner_id TEXT NOT NULL REFERENCES practitioners (id),
  exercise_id TEXT NOT NULL REFERENCES exercises (id),
  favourite INTEGER NOT NULL DEFAULT 0 CHECK (favourite IN (0, 1)),
  saved_at TEXT NOT NULL,
  last_used_at TEXT,
  text_overrides_json TEXT NOT NULL DEFAULT '{}',
  param_overrides_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (practitioner_id, exercise_id)
);

INSERT INTO body_regions (id, label) VALUES
  ('br-knee', 'knee'),
  ('br-ankle', 'ankle'),
  ('br-hip', 'hip');

INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json) VALUES
  (
    'td-global-stretching',
    'global',
    NULL,
    'stretching',
    '{"hold_s":30,"per_day":{"min":1,"max":3},"days_per_week":7}'
  ),
  (
    'td-global-isometric',
    'global',
    NULL,
    'isometric',
    '{"reps":1,"sets":3,"hold_s":10,"days_per_week":7}'
  ),
  (
    'td-global-concentric',
    'global',
    NULL,
    'concentric',
    '{"reps":10,"sets":3,"hold_s":2,"days_per_week":3}'
  ),
  (
    'td-global-eccentric',
    'global',
    NULL,
    'eccentric',
    '{"reps":10,"sets":3,"descent_s":4,"days_per_week":3}'
  );
