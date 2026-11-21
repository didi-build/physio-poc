-- DIDI-1215: in-progress elsewhere / concurrent generate guard for draft review orchestration.
ALTER TABLE exercise_requests ADD COLUMN draft_generation_locked_at TEXT;