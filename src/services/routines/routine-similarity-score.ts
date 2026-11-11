export type RoutineSimilarityScoreInput = {
  draftExerciseIds: readonly string[];
  draftConditionIds: readonly string[];
  candidateExerciseIds: readonly string[];
  candidateConditionIds: readonly string[];
  conditionMatchBonus: number;
};

export type RoutineSimilarityScoreResult = {
  score: number;
  exercise_jaccard: number;
  condition_match: boolean;
  shared_exercise_ids: string[];
  shared_condition_ids: string[];
};

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

export function exerciseSetJaccard(
  draftExerciseIds: readonly string[],
  candidateExerciseIds: readonly string[],
): number {
  const a = new Set(draftExerciseIds);
  const b = new Set(candidateExerciseIds);
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const id of a) {
    if (b.has(id)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  if (union === 0) {
    return 0;
  }
  return intersection / union;
}

export function intersectSorted(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const b = new Set(right);
  const shared: string[] = [];
  for (const id of uniqueSorted(left)) {
    if (b.has(id)) {
      shared.push(id);
    }
  }
  return shared;
}

export function scoreRoutineSimilarity(
  input: RoutineSimilarityScoreInput,
): RoutineSimilarityScoreResult {
  const exercise_jaccard = exerciseSetJaccard(
    input.draftExerciseIds,
    input.candidateExerciseIds,
  );
  const shared_exercise_ids = intersectSorted(
    input.draftExerciseIds,
    input.candidateExerciseIds,
  );
  const shared_condition_ids = intersectSorted(
    input.draftConditionIds,
    input.candidateConditionIds,
  );
  const condition_match = shared_condition_ids.length > 0;
  const score = exercise_jaccard + (condition_match ? input.conditionMatchBonus : 0);
  return {
    score,
    exercise_jaccard,
    condition_match,
    shared_exercise_ids,
    shared_condition_ids,
  };
}
