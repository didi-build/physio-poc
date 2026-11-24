-- DIDI-1283: ending position text on exercise versions (template field after starting_position).
ALTER TABLE exercise_versions ADD COLUMN ending_position TEXT NOT NULL DEFAULT '';
