export type ExerciseRequestDraftGenerationWorkflowParams = {
  requestId: string;
  practitionerId: string;
};

export type DraftGenerationWorkflowStartResult = "started" | "already_running";

export type DraftGenerationWorkflowPort = {
  start(
    input: ExerciseRequestDraftGenerationWorkflowParams,
  ): Promise<DraftGenerationWorkflowStartResult>;
};
