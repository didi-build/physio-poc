export const DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.example.com/v1/openai/chat/completions";

export const DEFAULT_DEEPINFRA_EXERCISE_DRAFT_MODEL_ID =
  "meta-llama/Llama-3.3-70B-Instruct-Turbo";

/** Upper bound while streaming a chat completion response body. */
export const DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES = 512 * 1024;

export const DEEPINFRA_EXERCISE_DRAFT_REQUEST_TIMEOUT_MS = 90_000;

export type DeepInfraExerciseDraftEnvInput = {
  PHYSIO_DEEPINFRA_EXERCISE_DRAFT_MODEL?: string;
};

export function resolveDeepInfraExerciseDraftModelId(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }
  return DEFAULT_DEEPINFRA_EXERCISE_DRAFT_MODEL_ID;
}
