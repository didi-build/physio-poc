export type ExerciseRequestDraftGenerationWorkflowParams = {
  requestId: string;
  practitionerId: string;
  attemptId: string;
};

export type DraftGenerationWorkflowStartResult = "started";

export type DraftGenerationWorkflowPort = {
  start(
    input: ExerciseRequestDraftGenerationWorkflowParams,
  ): Promise<DraftGenerationWorkflowStartResult>;
};
