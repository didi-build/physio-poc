import { ExerciseRequestsRepository } from "../../storage/repositories/exercise-data.js";
import { logDraftGenerationRunAbandoned } from "./draft-generation-lock-log.js";

export async function maybeLogDraftGenerationRunAbandoned(input: {
  requests: ExerciseRequestsRepository;
  requestId: string;
  attemptId: string;
  lockedAt: string;
  now: string;
}): Promise<void> {
  const logged = await input.requests.markDraftGenerationAbandonLoggedIfUnlogged({
    requestId: input.requestId,
    attemptId: input.attemptId,
    loggedAt: input.now,
  });
  if (!logged) {
    return;
  }
  logDraftGenerationRunAbandoned({
    requestId: input.requestId,
    attemptId: input.attemptId,
    lockedAt: input.lockedAt,
    now: input.now,
  });
}
