-- Private draft media for an approved version (confirm / publish is a follow-up ticket).

ALTER TABLE exercise_versions ADD COLUMN pending_media_set_id TEXT;