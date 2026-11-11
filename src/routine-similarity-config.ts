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

export type RoutineSimilarityEnvInput = {
  PHYSIO_ROUTINE_SIMILAR_THRESHOLD?: string;
  PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS?: string;
  PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS?: string;
  PHYSIO_ROUTINE_SIMILAR_AI_ENABLED?: string;
};

function parsePositiveNumber(
  raw: string | undefined,
  fallback: number,
  label: string,
): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return fallback;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  label: string,
): number {
  const value = parsePositiveNumber(raw, fallback, label);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
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
  const threshold = parsePositiveNumber(
    env.PHYSIO_ROUTINE_SIMILAR_THRESHOLD,
    DEFAULT_ROUTINE_SIMILAR_THRESHOLD,
    "PHYSIO_ROUTINE_SIMILAR_THRESHOLD",
  );
  const conditionMatchBonus = parsePositiveNumber(
    env.PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS,
    DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
    "PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS",
  );
  const maxResults = parsePositiveInt(
    env.PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS,
    DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS,
    "PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS",
  );
  const aiSimilarityEnabled = parseAiFlag(env.PHYSIO_ROUTINE_SIMILAR_AI_ENABLED);

  return {
    threshold: overrides.threshold ?? threshold,
    conditionMatchBonus: overrides.conditionMatchBonus ?? conditionMatchBonus,
    maxResults: overrides.maxResults ?? maxResults,
    aiSimilarityEnabled: overrides.aiSimilarityEnabled ?? aiSimilarityEnabled,
  };
}
