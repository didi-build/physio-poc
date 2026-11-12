/** design/app/programs/spec.md Publish blocked by missing images (DIDI-1192). */

import type { MediaVisibility } from "../storage/ports/media-storage.js";

export const PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE =
  "Remove exercises without images to publish";

export type ExerciseVersionMediaRef = {
  media_set_id: string | null;
  start_object_key?: string | null;
  end_object_key?: string | null;
  visibility?: MediaVisibility | null;
};

/** Matches link-scoped public serving and {@link EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE}. */
export function exerciseVersionLacksStartOrEndImage(
  version: ExerciseVersionMediaRef,
): boolean {
  if (version.media_set_id === null) {
    return true;
  }
  if (version.visibility === "draft") {
    return true;
  }
  const start = version.start_object_key;
  const end = version.end_object_key;
  if (start === undefined || end === undefined) {
    return true;
  }
  if (start === null || end === null) {
    return true;
  }
  if (start.trim().length === 0 || end.trim().length === 0) {
    return true;
  }
  if (version.visibility === "public") {
    return false;
  }
  if (version.visibility === undefined || version.visibility === null) {
    return false;
  }
  return true;
}

/** SQL fragment referencing alias `ev` for exercise_versions. */
export const EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE = `(
  ev.media_set_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM exercise_media_sets ems
    WHERE ems.id = ev.media_set_id
      AND ems.visibility = 'public'
      AND length(trim(ems.start_object_key)) > 0
      AND length(trim(ems.end_object_key)) > 0
  )
)`;
