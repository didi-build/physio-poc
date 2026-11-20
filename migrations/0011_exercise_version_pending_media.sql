-- Private draft media for an approved version (confirm / publish is DIDI-1261).

ALTER TABLE exercise_versions ADD COLUMN pending_media_set_id TEXT;
ALTER TABLE exercise_versions ADD COLUMN pending_media_requested_by TEXT REFERENCES practitioners (id) ON DELETE RESTRICT;