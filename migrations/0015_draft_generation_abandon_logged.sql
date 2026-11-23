-- DIDI-1289 R5: dedupe run_abandoned logs per attempt.
ALTER TABLE exercise_requests ADD COLUMN draft_generation_abandon_logged_at TEXT;