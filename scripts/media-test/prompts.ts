export type ExerciseImagePhase = "start" | "end";

const POSE_BY_PHASE: Record<ExerciseImagePhase, string> = {
  start: "Hold the starting position of the exercise, stable and anatomically neutral.",
  end: "Hold the end position of the exercise, stable and anatomically neutral.",
};

/**
 * Shared clinical illustration template from ADR 0005/0006.
 * @param exerciseNameSlug Short exercise label embedded in the prompt (not a patient identifier).
 */
export function buildExerciseImagePrompt(
  exerciseNameSlug: string,
  phase: ExerciseImagePhase,
): string {
  const pose = POSE_BY_PHASE[phase];
  return (
    `Clinical physiotherapy exercise demonstration: ${exerciseNameSlug}. ` +
    "Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. " +
    "Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. " +
    "Side or three-quarter view with unobstructed limbs and joints. " +
    pose
  );
}
