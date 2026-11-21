import { createDeepInfraExerciseDraftGenerator } from "./deepinfra-exercise-draft-generator.js";
import { resolveDeepInfraExerciseDraftModelId } from "./exercise-draft-ai-config.js";
import { fakeExerciseDraftGenerator } from "../../services/exercise-requests/fake-draft-generator.js";
import type { ExerciseDraftGenerator } from "../../services/exercise-requests/exercise-draft-generator-types.js";

export type ResolveExerciseDraftGeneratorEnv = {
  PHYSIO_DEEPINFRA_API_KEY?: string;
  PHYSIO_DEEPINFRA_EXERCISE_DRAFT_MODEL?: string;
};

export function resolveExerciseDraftGenerator(
  env: ResolveExerciseDraftGeneratorEnv,
): ExerciseDraftGenerator {
  const apiKey = env.PHYSIO_DEEPINFRA_API_KEY?.trim();
  if (!apiKey) {
    return fakeExerciseDraftGenerator;
  }
  return createDeepInfraExerciseDraftGenerator({
    apiKey,
    modelId: resolveDeepInfraExerciseDraftModelId(
      env.PHYSIO_DEEPINFRA_EXERCISE_DRAFT_MODEL,
    ),
  });
}
