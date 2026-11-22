/** Minimal Workflow binding surface (Workers bundler provides the real type). */
export type PhysioExerciseRequestDraftGenerationBinding = {
  create(input: {
    id: string;
    params: { requestId: string; practitionerId: string };
  }): Promise<unknown>;
  get(id: string): Promise<unknown>;
};
