import type { AppDependencies } from "../../src/http/app.js";
import type { PhysioExerciseRequestDraftGenerationBinding } from "../../src/adapters/workers/cloudflare-workflow-binding.js";
import type { ExerciseRequestDraftView } from "../../src/services/exercise-requests/types.js";
import {
  createInProcessDraftGenerationWorkflowPort,
  draftGeneratorFromDeps,
  type InProcessDraftGenerationWorkflowOptions,
} from "../../src/services/exercise-requests/in-process-draft-generation-workflow.js";
import { WORKFLOW_INSTANCE_ALREADY_EXISTS_ID } from "../../src/services/exercise-requests/workflow-instance-already-exists.js";

export function createRetainedCloudflareWorkflowBinding(input: {
  getDeps: () => AppDependencies;
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>;
  options?: InProcessDraftGenerationWorkflowOptions;
}): {
  binding: PhysioExerciseRequestDraftGenerationBinding;
  instances: Set<string>;
  drain: () => Promise<void>;
} {
  const instances = new Set<string>();
  const inflight = new Set<Promise<void>>();

  const binding: PhysioExerciseRequestDraftGenerationBinding = {
    async create(createInput) {
      if (instances.has(createInput.id)) {
        throw new Error(
          `${WORKFLOW_INSTANCE_ALREADY_EXISTS_ID} An instance with this ID already exists`,
        );
      }
      instances.add(createInput.id);
      const deps = input.getDeps();
      const port = createInProcessDraftGenerationWorkflowPort(
        () => ({
          deps,
          loadView: input.loadView,
          draftGenerator: draftGeneratorFromDeps(deps),
        }),
        input.options,
      );
      const run = port
        .start({
          requestId: createInput.params.requestId,
          practitionerId: createInput.params.practitionerId,
          attemptId: createInput.params.attemptId,
        })
        .then(() => port.drain(createInput.params.requestId));
      inflight.add(run);
      void run.finally(() => inflight.delete(run));
      return {};
    },
    async get() {
      return {};
    },
  };

  return {
    binding,
    instances,
    drain: async () => {
      await Promise.all([...inflight]);
    },
  };
}
