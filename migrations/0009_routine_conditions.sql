-- DIDI-1217: many-to-many routine conditions, condition dedupe metadata,
-- backfill from routines.condition_id.
--
-- routines.body_region_id: DEPRECATED (DIDI-1217). Column kept NOT NULL to avoid
-- rebuilding routines (referenced by routine_versions, practitioner_routines, programs).
-- New behavior derives body regions from exercises (DIDI-1218); do not rely on this column.

CREATE TABLE IF NOT EXISTS routine_conditions (
  routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE RESTRICT,
  condition_id TEXT NOT NULL REFERENCES conditions (id) ON DELETE RESTRICT,
  PRIMARY KEY (routine_id, condition_id)
);

ALTER TABLE conditions ADD COLUMN created_by_practitioner_id TEXT REFERENCES practitioners (id) ON DELETE RESTRICT;

ALTER TABLE conditions ADD COLUMN label_normalized TEXT;

-- Matches normalizeConditionLabelKey (see condition-label-normalize-sql.ts).
UPDATE conditions
SET label_normalized = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(replace(replace(replace(replace(replace(label, char(9), ' '), char(10), ' '), char(13), ' '), char(11), ' '), char(12), ' '))), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')
WHERE label IS NOT NULL
  AND label_normalized IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conditions_label_normalized ON conditions (label_normalized);

INSERT OR IGNORE INTO routine_conditions (routine_id, condition_id)
SELECT id, condition_id
FROM routines
WHERE condition_id IS NOT NULL;
