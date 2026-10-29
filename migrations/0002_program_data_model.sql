CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT,
  created_by TEXT NOT NULL REFERENCES practitioners (id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  draft_version INTEGER NOT NULL DEFAULT 1 CHECK (draft_version >= 1),
  draft_updated_at TEXT NOT NULL,
  published_version INTEGER CHECK (
    published_version IS NULL OR published_version >= 1
  ),
  published_name TEXT,
  published_at TEXT,
  published_snapshot_json TEXT CHECK (
    published_snapshot_json IS NULL OR json_valid(published_snapshot_json)
  ),
  deleted_at TEXT,
  link_expires_in TEXT CHECK (
    link_expires_in IS NULL
    OR link_expires_in IN (
      '1_week',
      '30_days',
      '90_days',
      '1_year',
      'never',
      'custom_date'
    )
  ),
  link_expires_on TEXT,
  CHECK (
    (published_at IS NULL AND published_version IS NULL AND published_name IS NULL AND published_snapshot_json IS NULL)
    OR (
      published_at IS NOT NULL
      AND published_version IS NOT NULL
      AND published_name IS NOT NULL
      AND published_snapshot_json IS NOT NULL
    )
  ),
  CHECK (
    (link_expires_in = 'custom_date' AND link_expires_on IS NOT NULL)
    OR (link_expires_in IS NULL OR link_expires_in <> 'custom_date')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_code ON programs (code COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS program_rows (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs (id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  exercise_id TEXT REFERENCES exercises (id) ON DELETE RESTRICT,
  exercise_version_id TEXT REFERENCES exercise_versions (id) ON DELETE RESTRICT,
  exercise_request_id TEXT REFERENCES exercise_requests (id) ON DELETE RESTRICT,
  prescription_type TEXT NOT NULL CHECK (
    prescription_type IN ('stretching', 'isometric', 'concentric', 'eccentric')
  ),
  params_json TEXT NOT NULL CHECK (json_valid(params_json)),
  text_snapshot_json TEXT NOT NULL CHECK (json_valid(text_snapshot_json)),
  note TEXT,
  UNIQUE (program_id, position),
  CHECK (
    (
      exercise_request_id IS NOT NULL
      AND exercise_id IS NULL
      AND exercise_version_id IS NULL
    )
    OR (
      exercise_request_id IS NULL
      AND exercise_id IS NOT NULL
      AND exercise_version_id IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs (id) ON DELETE RESTRICT,
  token TEXT NOT NULL,
  expires_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_token ON share_links (token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_one_open_per_program ON share_links (program_id)
WHERE
  closed_at IS NULL;

CREATE TABLE IF NOT EXISTS share_link_defaults (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'practitioner')),
  practitioner_id TEXT REFERENCES practitioners (id) ON DELETE RESTRICT,
  expires_in TEXT NOT NULL CHECK (
    expires_in IN (
      '1_week',
      '30_days',
      '90_days',
      '1_year',
      'never',
      'custom_date'
    )
  ),
  custom_expires_on TEXT,
  CHECK (
    (scope = 'global' AND practitioner_id IS NULL)
    OR (scope = 'practitioner' AND practitioner_id IS NOT NULL)
  ),
  CHECK (
    (expires_in = 'custom_date' AND custom_expires_on IS NOT NULL)
    OR (expires_in <> 'custom_date' AND custom_expires_on IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_link_defaults_global ON share_link_defaults (scope)
WHERE
  scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_share_link_defaults_practitioner ON share_link_defaults (practitioner_id)
WHERE
  scope = 'practitioner';

INSERT INTO share_link_defaults (id, scope, practitioner_id, expires_in, custom_expires_on) VALUES
  ('sld-global', 'global', NULL, '1_year', NULL);
