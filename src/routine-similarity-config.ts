export type RoutineSimilarityConfig = {
  /** Minimum score (inclusive) for a routine to appear in results. */
  readonly threshold: number;
  /** Added to the exercise Jaccard when draft and candidate share ≥1 condition id. */
  readonly conditionMatchBonus: number;
  readonly maxResults: number;
  /** Reserved for a later DeepInfra path; must stay false until implemented. */
  readonly aiSimilarityEnabled: boolean;
};

export const DEFAULT_ROUTINE_SIMILAR_THRESHOLD = 0.5;
export const DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS = 0.1;
export const DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS = 5;

/** Cap on exercise_ids and condition_ids list length per request (bounded work). */
export const ROUTINE_SIMILAR_MAX_INPUT_IDS = 64;

export type RoutineSimilarityEnvInput = {
  PHYSIO_ROUTINE_SIMILAR_THRESHOLD?: string;
  PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS?: string;
  PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS?: string;
  PHYSIO_ROUTINE_SIMILAR_AI_ENABLED?: string;
};

function parseUnitIntervalEnv(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return fallback;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return fallback;
  }
  return value;
}

function parseMaxResultsEnv(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return fallback;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > 20) {
    return fallback;
  }
  return value;
}

function parseAiFlag(raw: string | undefined): boolean {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  return trimmed === "true" || trimmed === "1";
}

export function resolveRoutineSimilarityConfig(
  env: RoutineSimilarityEnvInput = {},
  overrides: Partial<RoutineSimilarityConfig> = {},
): RoutineSimilarityConfig {
  const threshold = parseUnitIntervalEnv(
    env.PHYSIO_ROUTINE_SIMILAR_THRESHOLD,
    DEFAULT_ROUTINE_SIMILAR_THRESHOLD,
  );
  const conditionMatchBonus = parseUnitIntervalEnv(
    env.PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS,
    DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
  );
  const maxResults = parseMaxResultsEnv(
    env.PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS,
    DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS,
  );
  const aiSimilarityEnabled = parseAiFlag(env.PHYSIO_ROUTINE_SIMILAR_AI_ENABLED);

  return {
    threshold: overrides.threshold ?? threshold,
    conditionMatchBonus: overrides.conditionMatchBonus ?? conditionMatchBonus,
    maxResults: overrides.maxResults ?? maxResults,
    aiSimilarityEnabled: overrides.aiSimilarityEnabled ?? aiSimilarityEnabled,
  };
}
