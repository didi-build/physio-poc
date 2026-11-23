import type { AppDependencies } from "../../src/http/app.js";
import { ExerciseMediaService } from "../../src/services/exercise-media/exercise-media-service.js";
import { createInProcessDraftGenerationWorkflowPort } from "../../src/services/exercise-requests/in-process-draft-generation-workflow.js";
import type { DraftGenerationWorkflowPort } from "../../src/services/exercise-requests/draft-generation-workflow-types.js";
import type { ExerciseDraftGenerator } from "../../src/services/exercise-requests/exercise-draft-generator-types.js";
import type {
  ExerciseRequestDraftView,
  GenerateExerciseRequestDraftResult,
} from "../../src/services/exercise-requests/types.js";
import type { ExerciseRequestsService } from "../../src/services/exercise-requests/exercise-requests-service.js";
import { InMemoryObjectStorage } from "../../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../../src/storage/adapters/memory/fake-image-generation.js";
import { PrefixMediaStorage } from "../../src/storage/adapters/memory/prefix-media-storage.js";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import { fakeExerciseDraftGenerator } from "../../src/services/exercise-requests/fake-draft-generator.js";

export type TestDraftGenerationWorkflowHandle = ReturnType<
  typeof createTestDraftGenerationWorkflowPort
>;

export function createTestDraftGenerationWorkflowPort(input: {
  sql: SqlStoragePort;
  loadView: (requestId: string) => Promise<ExerciseRequestDraftView>;
  draftGenerator: ExerciseDraftGenerator;
  mediaService?: ExerciseMediaService;
}): DraftGenerationWorkflowPort & {
  drain: (requestId?: string) => Promise<void>;
} {
  const deps = {
    sql: input.sql,
    objects: new InMemoryObjectStorage(),
    exerciseMediaImages: new FakeImageGeneration(),
  } as unknown as AppDependencies;
  const mediaService =
    input.mediaService ??
    new ExerciseMediaService(
      input.sql,
      new FakeImageGeneration(),
      new PrefixMediaStorage(new InMemoryObjectStorage()),
    );
  return createInProcessDraftGenerationWorkflowPort(() => ({
    deps,
    loadView: input.loadView,
    draftGenerator: input.draftGenerator,
    mediaService,
  }));
}

export async function generateRequestAndDrainWorkflow(input: {
  service: ExerciseRequestsService;
  practitionerId: string;
  requestId: string;
  mediaService: ExerciseMediaService;
  workflow: TestDraftGenerationWorkflowHandle;
}): Promise<GenerateExerciseRequestDraftResult> {
  const started = await input.service.generateRequest({
    practitionerId: input.practitionerId,
    requestId: input.requestId,
    mediaService: input.mediaService,
    workflow: input.workflow,
  });
  if (started.outcome !== "in_progress") {
    return started;
  }
  await input.workflow.drain(input.requestId);
  const view = await input.service.loadDraftView(input.requestId);
  if (view.generation.first_draft_complete) {
    return { outcome: "complete", view };
  }
  const phase = view.generation.generation_failure ?? null;
  const code = view.generation.generation_failure_code ?? null;
  if (phase === "text") {
    return {
      outcome: "text_failed",
      error: code ?? "unexpected_generation_failure",
      view: null,
    };
  }
  if (phase === "images") {
    return { outcome: "images_failed", view };
  }
  if (phase === "daily") {
    return { outcome: "daily_limit", view };
  }
  return started;
}

export async function serviceGenerateRequestWithDrain(
  service: ExerciseRequestsService,
  sql: SqlStoragePort,
  input: {
    practitionerId: string;
    requestId: string;
    mediaService: ExerciseMediaService;
    draftGenerator?: ExerciseDraftGenerator;
  },
): Promise<GenerateExerciseRequestDraftResult> {
  const draftGenerator = input.draftGenerator ?? fakeExerciseDraftGenerator;
  const workflow = createTestDraftGenerationWorkflowPort({
    sql,
    loadView: (requestId) => service.loadDraftView(requestId),
    draftGenerator,
    mediaService: input.mediaService,
  });
  return generateRequestAndDrainWorkflow({
    service,
    practitionerId: input.practitionerId,
    requestId: input.requestId,
    mediaService: input.mediaService,
    workflow,
  });
}
