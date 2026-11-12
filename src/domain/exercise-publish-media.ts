/** design/app/programs/spec.md Publish blocked by missing images (DIDI-1192). */

export const PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE =
  "Remove exercises without images to publish";

export type ExerciseVersionMediaRef = {
  media_set_id: string | null;
  start_object_key?: string | null;
  end_object_key?: string | null;
};

export function exerciseVersionLacksStartOrEndImage(
  version: ExerciseVersionMediaRef,
): boolean {
  if (version.media_set_id === null) {
    return true;
  }
  const start = version.start_object_key;
  const end = version.end_object_key;
  if (start !== undefined && start !== null && start.trim().length === 0) {
    return true;
  }
  if (end !== undefined && end !== null && end.trim().length === 0) {
    return true;
  }
  if (start !== undefined && end !== undefined) {
    return false;
  }
  return false;
}

/** SQL fragment referencing alias `ev` for exercise_versions. */
export const EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE = `(
  ev.media_set_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM exercise_media_sets ems
    WHERE ems.id = ev.media_set_id
      AND length(trim(ems.start_object_key)) > 0
      AND length(trim(ems.end_object_key)) > 0
  )
)`;
