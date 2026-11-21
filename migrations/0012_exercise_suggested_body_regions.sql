-- AI / practitioner suggested body region names for draft exercises (no body_regions row yet; DIDI-1254).

CREATE TABLE IF NOT EXISTS exercise_suggested_body_regions (
  exercise_id TEXT NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK (length(trim(label)) >= 1 AND length(trim(label)) <= 80),
  PRIMARY KEY (exercise_id, label COLLATE NOCASE)
);