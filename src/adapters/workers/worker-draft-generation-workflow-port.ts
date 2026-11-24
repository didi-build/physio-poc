import type { DraftGenerationWorkflowPort } from "../../services/exercise-requests/draft-generation-workflow-types.js";
import type { ExerciseRequestDraftGenerationWorkflowEnv } from "./exercise-request-draft-generation-workflow.js";

export function createWorkerDraftGenerationWorkflowPort(
  env: ExerciseRequestDraftGenerationWorkflowEnv,
): DraftGenerationWorkflowPort {
  const binding = env.PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION;
  if (!binding) {
    throw new Error("PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION binding is required");
  }
  return {
    async start(input) {
      const instanceId = `${input.requestId}:${input.attemptId}`;
      await binding.create({
        id: instanceId,
        params: {
          requestId: input.requestId,
          practitionerId: input.practitionerId,
          attemptId: input.attemptId,
        },
      });
      return "started";
    },
  };
}
