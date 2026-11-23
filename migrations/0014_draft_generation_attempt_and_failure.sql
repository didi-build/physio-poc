-- DIDI-1289 R1: attempt-scoped locks and persisted generation failures for GET.
ALTER TABLE exercise_requests ADD COLUMN draft_generation_attempt_id TEXT;
ALTER TABLE exercise_requests ADD COLUMN draft_generation_failure_code TEXT;
