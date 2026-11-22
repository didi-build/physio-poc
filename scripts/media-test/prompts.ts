import {
  buildEndImagePrompt,
  buildStartImagePrompt,
} from "../../src/domain/exercise-media-prompts.js";

export type ExerciseImagePhase = "start" | "end";

/**
 * Shared clinical illustration template aligned with production prompt builders.
 * @param exerciseNameSlug Short exercise label embedded in the prompt (not a patient identifier).
 */
export function buildExerciseImagePrompt(
  exerciseNameSlug: string,
  phase: ExerciseImagePhase,
  steps?: string,
): string {
  const ctx = {
    title: exerciseNameSlug,
    steps: steps ?? "",
  };
  return phase === "start" ? buildStartImagePrompt(ctx) : buildEndImagePrompt(ctx);
}
