import type { AppDependencies } from "../../src/http/app.js";
import type { ExerciseRequestDraftView } from "../../src/services/exercise-requests/types.js";
import {
  createInProcessDraftGenerationWorkflowPort,
  draftGeneratorFromDeps,
  type InProcessDraftGenerationWorkflowOptions,
} from "../../src/services/exercise-requests/in-process-draft-generation-workflow.js";

export type DraftGenerationTestWorkflowHandle = ReturnType<
  typeof createInProcessDraftGenerationWorkflowPort
>;

export function attachDraftGenerationTestWorkflow(
  deps: AppDependencies,
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>,
  options?: InProcessDraftGenerationWorkflowOptions,
): {
  deps: AppDependencies;
  workflow: DraftGenerationTestWorkflowHandle;
} {
  const workflow = createInProcessDraftGenerationWorkflowPort(
    () => ({
      deps,
      loadView,
      draftGenerator: draftGeneratorFromDeps(deps),
    }),
    options,
  );
  return {
    deps: { ...deps, draftGenerationWorkflow: workflow },
    workflow,
  };
}

export async function drainDraftGeneration(
  workflow: DraftGenerationTestWorkflowHandle,
  requestId?: string,
): Promise<void> {
  await workflow.drain(requestId);
}
