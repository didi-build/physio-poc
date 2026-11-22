import type { DraftGenerationWorkflowPort } from "../../services/exercise-requests/draft-generation-workflow-types.js";
import type { ExerciseRequestDraftGenerationWorkflowEnv } from "./exercise-request-draft-generation-workflow.js";

const DUPLICATE_INSTANCE_MESSAGE = "already exists";

function isDuplicateWorkflowInstance(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.toLowerCase().includes(DUPLICATE_INSTANCE_MESSAGE);
}

export function createWorkerDraftGenerationWorkflowPort(
  env: ExerciseRequestDraftGenerationWorkflowEnv,
): DraftGenerationWorkflowPort {
  const binding = env.PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION;
  if (!binding) {
    throw new Error("PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION binding is required");
  }
  return {
    async start(input) {
      try {
        await binding.create({
          id: input.requestId,
          params: {
            requestId: input.requestId,
            practitionerId: input.practitionerId,
          },
        });
        return "started";
      } catch (error) {
        if (isDuplicateWorkflowInstance(error)) {
          return "already_running";
        }
        throw error;
      }
    },
  };
}
