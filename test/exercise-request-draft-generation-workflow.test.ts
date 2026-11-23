import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/adapters/workers/create-worker-production-app-dependencies.js", () => ({
  createWorkerProductionAppDependencies: vi.fn(),
}));

import { NonRetryableError } from "cloudflare:workflows";
import {
  DRAFT_GENERATION_WORKFLOW_STEP_RETRY,
  ExerciseRequestDraftGenerationWorkflow,
} from "../src/adapters/workers/exercise-request-draft-generation-workflow.js";
import type { DraftGenerationStepName } from "../src/services/exercise-requests/draft-generation-lock-log.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { createWorkerProductionAppDependencies } from "../src/adapters/workers/create-worker-production-app-dependencies.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import type { ExerciseDraftGenerator } from "../src/services/exercise-requests/exercise-draft-generator-types.js";
import { DeepInfraExerciseDraftError } from "../src/services/exercise-requests/deepinfra-exercise-draft-error.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  DRAFT_GENERATION_LOCK_ACQUIRED_EVENT,
  DRAFT_GENERATION_LOCK_RELEASED_EVENT,
  DRAFT_GENERATION_RUN_CANCELED_EVENT,
  DRAFT_GENERATION_STEP_ENDED_EVENT,
} from "../src/services/exercise-requests/draft-generation-lock-log.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import { DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL } from "../src/adapters/deepinfra/exercise-draft-ai-config.js";
import {
  ImageGenerationError,
  type ImageGenerationPort,
} from "../src/storage/ports/image-generation.js";

type FakeExecutionContext = { waitUntil: (_promise: Promise<unknown>) => void };

function isNonRetryableWorkflowError(error: unknown): boolean {
  return (
    error instanceof NonRetryableError ||
    (error instanceof Error && error.name === "NonRetryableError")
  );
}

class RecordingWorkflowStep {
  readonly completed = new Map<string, unknown>();
  readonly attempts = new Map<string, number>();

  async do<T>(
    name: string,
    configOrFn: (() => Promise<T>) | { retries?: { limit: number } },
    maybeFn?: () => Promise<T>,
  ): Promise<T> {
    const config = typeof configOrFn === "function" ? undefined : configOrFn;
    const fn = typeof configOrFn === "function" ? configOrFn : maybeFn!;
    const limit = config?.retries?.limit ?? 0;
    const maxAttempts = limit + 1;
    if (this.completed.has(name)) {
      return this.completed.get(name) as T;
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      this.attempts.set(name, attempt);
      try {
        const value = await fn();
        this.completed.set(name, value);
        return value;
      } catch (error) {
        lastError = error;
        if (isNonRetryableWorkflowError(error)) {
          throw error;
        }
      }
    }
    throw lastError;
  }
}

function mockProductionDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  draftGenerator: ExerciseDraftGenerator,
  exerciseMediaImages: ImageGenerationPort = new FakeImageGeneration(),
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: "unused",
      email: "wf@ex.com",
      displayName: "Coach",
    },
  });
  const base = {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    auth,
    mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    exerciseDraftGenerator: draftGenerator,
    exerciseMediaImages,
    extraRouteHandlers: [handleExerciseMediaRequest],
  };
  vi.mocked(createWorkerProductionAppDependencies).mockReturnValue(base as never);
  return base;
}

async function seedLockedRequest(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
) {
  const practitioner = await seedPractitioner(storage, id("pr-wf-int"), "wf@ex.com");
  const requestId = testOpaqueEntityId("wf-req");
  await seedDraftingExerciseRequest(storage, {
    requestId,
    practitionerId: practitioner,
    requestedName: "Workflow integration",
  });
  const attemptId = crypto.randomUUID();
  const lockedAt = new Date().toISOString();
  await storage.run(
    `UPDATE exercise_requests
     SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
     WHERE id = ?`,
    [lockedAt, attemptId, requestId],
  );
  return { practitioner, requestId, attemptId, lockedAt };
}

describe("ExerciseRequestDraftGenerationWorkflow.run", () => {
  it("pins STEP_RETRY limit at 2 (3 Cloudflare attempts)", () => {
    expect(DRAFT_GENERATION_WORKFLOW_STEP_RETRY.retries.limit).toBe(2);
    expect(DRAFT_GENERATION_WORKFLOW_STEP_RETRY.retries.backoff).toBe("exponential");
    expect(DRAFT_GENERATION_WORKFLOW_STEP_RETRY.retries.delay).toBe("1 second");
  });

  it("replays completed step.do callbacks and retries transient throws up to 3", async () => {
    const chunks: string[] = [];
    let textAttempts = 0;
    const workflow = new ExerciseRequestDraftGenerationWorkflow(
      { waitUntil() {} } as FakeExecutionContext,
      {} as never,
    );
    (
      workflow as unknown as { runChunk: (...args: unknown[]) => Promise<void> }
    ).runChunk = async (...args: unknown[]) => {
      const stopAfterStep = args[4] as DraftGenerationStepName;
      chunks.push(stopAfterStep);
      if (stopAfterStep === "text") {
        textAttempts += 1;
        if (textAttempts < 3) {
          throw new Error("transient_text");
        }
      }
    };

    const step = new RecordingWorkflowStep();
    await workflow.run(
      {
        payload: {
          requestId: "11111111-1111-4111-8111-111111111111",
          practitionerId: "22222222-2222-4222-8222-222222222222",
          attemptId: "33333333-3333-4333-8333-333333333333",
        },
        timestamp: new Date(),
        instanceId:
          "11111111-1111-4111-8111-111111111111:33333333-3333-4333-8333-333333333333",
      },
      step as never,
    );
    expect(textAttempts).toBe(3);
    expect(step.attempts.get("text")).toBe(3);
    expect(chunks.filter((c) => c === "text")).toHaveLength(3);
    expect(chunks).toContain("finalize");
    expect(step.attempts.get("finalize")).toBe(1);
  });

  it("does not retry NonRetryableError", async () => {
    const workflow = new ExerciseRequestDraftGenerationWorkflow(
      { waitUntil() {} } as FakeExecutionContext,
      {} as never,
    );
    (workflow as unknown as { runChunk: () => Promise<void> }).runChunk = async () => {
      throw new NonRetryableError("terminal");
    };
    const step = new RecordingWorkflowStep();
    await expect(
      workflow.run(
        {
          payload: {
            requestId: "11111111-1111-4111-8111-111111111111",
            practitionerId: "22222222-2222-4222-8222-222222222222",
            attemptId: "33333333-3333-4333-8333-333333333333",
          },
          timestamp: new Date(),
          instanceId:
            "11111111-1111-4111-8111-111111111111:33333333-3333-4333-8333-333333333333",
        },
        step as never,
      ),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
    );
    expect(step.attempts.get("text")).toBe(1);
  });

  it("does not retry request_not_found from runChunk", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-wf-not-found"),
        "nf@ex.com",
      );
      mockProductionDeps(storage, fakeExerciseDraftGenerator);
      const requestId = testOpaqueEntityId("wf-missing-req");
      const attemptId = crypto.randomUUID();
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("text")).toBe(1);
    } finally {
      storage.close();
    }
  });
});

describe("ExerciseRequestDraftGenerationWorkflow integration (real class, provider faked)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("transient text: 3 provider calls, no image phase, failure persisted once at end", async () => {
    const storage = await openMigratedDatabase();
    const failureSpy = vi.spyOn(
      ExerciseRequestsRepository.prototype,
      "setDraftGenerationFailure",
    );
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      let calls = 0;
      const generator: ExerciseDraftGenerator = async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("transient_provider");
        }
        throw new DeepInfraExerciseDraftError(
          "deepinfra_exercise_draft_request_failed",
        );
      };
      mockProductionDeps(storage, generator);
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
      });
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(calls).toBe(3);
      expect(step.attempts.get("start_image")).toBeUndefined();
      expect(failureSpy).toHaveBeenCalledTimes(1);
      const after = await service.loadDraftView(requestId);
      expect(after.generation.generation_failure).toBe("text");
      expect(after.generation.generation_in_progress).toBe(false);
    } finally {
      failureSpy.mockRestore();
      storage.close();
    }
  });

  it("terminal text: 1 provider call and later steps never run", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      let calls = 0;
      const generator: ExerciseDraftGenerator = async () => {
        calls += 1;
        throw new DeepInfraExerciseDraftError(
          "deepinfra_exercise_draft_request_failed",
          {
            httpStatus: 401,
          },
        );
      };
      mockProductionDeps(storage, generator);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(calls).toBe(1);
      expect(step.attempts.get("text")).toBe(1);
      expect(step.attempts.get("start_image")).toBeUndefined();
    } finally {
      storage.close();
    }
  });

  it("healthy run logs step_ended and lock_released literals once, never run_canceled", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      mockProductionDeps(storage, fakeExerciseDraftGenerator);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await workflow.run(
        {
          payload: { requestId, practitionerId: practitioner, attemptId },
          timestamp: new Date(),
          instanceId: `${requestId}:${attemptId}`,
        },
        step as never,
      );
      expect(step.attempts.get("start_image")).toBe(1);
      expect(step.attempts.get("end_image")).toBe(1);
      const lines = vi
        .mocked(console.log)
        .mock.calls.map((c) => String(c[0]))
        .filter((line) => line.startsWith("{"));
      const events = lines.map(
        (line) => JSON.parse(line) as { event: string; lock_age_ms?: number },
      );
      expect(
        events.filter((e) => e.event === DRAFT_GENERATION_STEP_ENDED_EVENT).length,
      ).toBeGreaterThan(0);
      expect(
        events.filter((e) => e.event === DRAFT_GENERATION_LOCK_RELEASED_EVENT),
      ).toHaveLength(1);
      expect(
        events.filter((e) => e.event === DRAFT_GENERATION_RUN_CANCELED_EVENT),
      ).toHaveLength(0);
      expect(
        events.some(
          (e) =>
            e.event === "physio_draft_generation_lock_refreshed" &&
            (e.lock_age_ms ?? 0) > 0,
        ),
      ).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("exhausted text step persists failure, releases lock, and maps text phase (R04/R09)", async () => {
    const storage = await openMigratedDatabase();
    const failureSpy = vi.spyOn(
      ExerciseRequestsRepository.prototype,
      "setDraftGenerationFailure",
    );
    const releaseSpy = vi.spyOn(
      ExerciseRequestsRepository.prototype,
      "releaseDraftGenerationLock",
    );
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      let calls = 0;
      const generator: ExerciseDraftGenerator = async () => {
        calls += 1;
        throw new Error("transient_provider");
      };
      mockProductionDeps(storage, generator);
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
      });
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(calls).toBe(3);
      expect(failureSpy).toHaveBeenCalledTimes(1);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
      const after = await service.loadDraftView(requestId);
      expect(after.generation.generation_failure).toBe("text");
      expect(after.generation.generation_in_progress).toBe(false);
    } finally {
      failureSpy.mockRestore();
      releaseSpy.mockRestore();
      storage.close();
    }
  });

  it("superseded lock is not retried (R07)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      mockProductionDeps(storage, fakeExerciseDraftGenerator);
      const refreshBase =
        ExerciseRequestsRepository.prototype.refreshDraftGenerationLock;
      let refreshCalls = 0;
      vi.spyOn(
        ExerciseRequestsRepository.prototype,
        "refreshDraftGenerationLock",
      ).mockImplementation(async function (
        this: ExerciseRequestsRepository,
        input: Parameters<ExerciseRequestsRepository["refreshDraftGenerationLock"]>[0],
      ) {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          return false;
        }
        return refreshBase.call(this, input);
      });
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("text")).toBe(1);
      expect(step.attempts.get("start_image")).toBe(1);
    } finally {
      vi.restoreAllMocks();
      storage.close();
    }
  });

  it("exhausted image step maps images phase failure (R09)", async () => {
    const storage = await openMigratedDatabase();
    const failureSpy = vi.spyOn(
      ExerciseRequestsRepository.prototype,
      "setDraftGenerationFailure",
    );
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      const images: ImageGenerationPort = {
        async generateStartImage() {
          throw new ImageGenerationError("image_generation_network_failed", 503);
        },
        async generateEndImage() {
          throw new ImageGenerationError("image_generation_network_failed", 503);
        },
        async generateStartAndEndImages() {
          throw new ImageGenerationError("image_generation_network_failed", 503);
        },
      };
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "wf-img@ex.com",
          displayName: "Coach",
        },
      });
      const base = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        exerciseMediaImages: images,
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      vi.mocked(createWorkerProductionAppDependencies).mockReturnValue(base as never);
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("start_image")).toBe(3);
      const after = await service.loadDraftView(requestId);
      expect(after.generation.generation_failure).toBe("images");
      expect(failureSpy).toHaveBeenCalledTimes(1);
    } finally {
      failureSpy.mockRestore();
      storage.close();
    }
  });

  it("network error on text is retried through step.do (P02)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      const generator: ExerciseDraftGenerator = async () => {
        throw new DeepInfraExerciseDraftError("deepinfra_exercise_draft_network_error");
      };
      mockProductionDeps(storage, generator);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("text")).toBe(3);
    } finally {
      storage.close();
    }
  });

  it("HTTP 429 on text is retried through step.do (P03)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      const generator: ExerciseDraftGenerator = async () => {
        throw new DeepInfraExerciseDraftError(
          "deepinfra_exercise_draft_request_failed",
          {
            httpStatus: 429,
          },
        );
      };
      mockProductionDeps(storage, generator);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("text")).toBe(3);
    } finally {
      storage.close();
    }
  });

  it("text request_failed without HTTP status is retried (P06)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      const generator: ExerciseDraftGenerator = async () => {
        throw new DeepInfraExerciseDraftError(
          "deepinfra_exercise_draft_request_failed",
        );
      };
      mockProductionDeps(storage, generator);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("text")).toBe(3);
    } finally {
      storage.close();
    }
  });

  it("image HTTP 503 is retried through step.do (P08)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      const images: ImageGenerationPort = {
        async generateStartImage() {
          throw new ImageGenerationError("image_generation_request_failed", 503);
        },
        async generateEndImage() {
          throw new ImageGenerationError("image_generation_request_failed", 503);
        },
        async generateStartAndEndImages() {
          throw new ImageGenerationError("image_generation_request_failed", 503);
        },
      };
      mockProductionDeps(storage, fakeExerciseDraftGenerator, images);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("start_image")).toBe(3);
    } finally {
      storage.close();
    }
  });

  it("image HTTP 400 is not retried (P09)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
      const images: ImageGenerationPort = {
        async generateStartImage() {
          throw new ImageGenerationError("image_generation_request_failed", 400);
        },
        async generateEndImage() {
          throw new ImageGenerationError("image_generation_request_failed", 400);
        },
        async generateStartAndEndImages() {
          throw new ImageGenerationError("image_generation_request_failed", 400);
        },
      };
      mockProductionDeps(storage, fakeExerciseDraftGenerator, images);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      await expect(
        workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        ),
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof Error && err.name === "NonRetryableError",
      );
      expect(step.attempts.get("start_image")).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("pins lock_acquired event literal", () => {
    expect(DRAFT_GENERATION_LOCK_ACQUIRED_EVENT).toBe(
      "physio_draft_generation_lock_acquired",
    );
    expect(DRAFT_GENERATION_STEP_ENDED_EVENT).toBe(
      "physio_draft_generation_step_ended",
    );
    expect(DRAFT_GENERATION_LOCK_RELEASED_EVENT).toBe(
      "physio_draft_generation_lock_released",
    );
    expect(DRAFT_GENERATION_RUN_CANCELED_EVENT).toBe(
      "physio_draft_generation_run_canceled",
    );
  });
});

describe("ExerciseRequestDraftGenerationWorkflow DeepInfra (real generator, fetch stubbed)", () => {
  const STUB_DRAFT = {
    title: "Heel slide",
    aliases: ["Heel slides"],
    category: "stretch",
    body_regions: ["knee"],
    description: "Gentle knee flexion stretch.",
    equipment: "Mat",
    starting_position: "Supine on mat.",
    steps: "1. Bend\n2. Slide heel",
    common_mistakes: "Rushing",
    regressions: "Smaller range",
    progressions: "Hold longer",
    precautions: "Stop if pain",
    cue_stretching: "Move slowly",
    cue_isometric: null,
    cue_concentric: null,
    cue_eccentric: null,
  } as const;

  function installChatFetch(responses: Array<() => Response>) {
    let calls = 0;
    const original = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (
        url === DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL ||
        url.endsWith("/v1/openai/chat/completions")
      ) {
        const next = responses[Math.min(calls, responses.length - 1)]!;
        calls += 1;
        return next();
      }
      return original(input, init);
    };
    return {
      callCount: () => calls,
      restore: () => {
        globalThis.fetch = original;
      },
    };
  }

  async function runLockedDeepInfraWorkflow(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    _fetchStub: ReturnType<typeof installChatFetch>,
  ) {
    const { practitioner, requestId, attemptId } = await seedLockedRequest(storage);
    const draftGenerator = createDeepInfraExerciseDraftGenerator({ apiKey: "wf-key" });
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: practitioner,
        email: "wf-di@ex.com",
        displayName: "Coach",
      },
    });
    const base = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      exerciseDraftGenerator: draftGenerator,
      exerciseMediaImages: new FakeImageGeneration(),
      extraRouteHandlers: [handleExerciseMediaRequest],
    };
    vi.mocked(createWorkerProductionAppDependencies).mockReturnValue(base as never);
    const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
      draftGenerator,
    });
    const workflow = new ExerciseRequestDraftGenerationWorkflow(
      { waitUntil() {} } as FakeExecutionContext,
      {} as never,
    );
    const step = new RecordingWorkflowStep();
    try {
      await workflow.run(
        {
          payload: { requestId, practitionerId: practitioner, attemptId },
          timestamp: new Date(),
          instanceId: `${requestId}:${attemptId}`,
        },
        step as never,
      );
    } catch {
      // exhausted failure paths
    }
    return { service, requestId, step, callCount: _fetchStub.callCount() };
  }

  it("503 then 200 succeeds on attempt 2 with real generator and Workflow", async () => {
    const storage = await openMigratedDatabase();
    const fetch = installChatFetch([
      () => new Response("unavailable", { status: 503 }),
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(STUB_DRAFT) } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ]);
    try {
      const { service, requestId, step, callCount } = await runLockedDeepInfraWorkflow(
        storage,
        fetch,
      );
      expect(step.attempts.get("text")).toBe(2);
      expect(callCount).toBe(2);
      const after = await service.loadDraftView(requestId);
      expect(after.generation.generation_failure).toBeNull();
      expect(after.exercise_id).not.toBeNull();
    } finally {
      fetch.restore();
      storage.close();
    }
  });

  it("three timeouts fail after exactly 3 fetch calls", async () => {
    const storage = await openMigratedDatabase();
    const fetch = installChatFetch([
      () => {
        const err = new DOMException("The operation was aborted.", "AbortError");
        throw err;
      },
    ]);
    try {
      const { service, requestId, step, callCount } = await runLockedDeepInfraWorkflow(
        storage,
        fetch,
      );
      expect(step.attempts.get("text")).toBe(3);
      expect(callCount).toBe(3);
      const after = await service.loadDraftView(requestId);
      expect(after.generation.generation_failure).toBe("text");
      expect(after.generation.generation_in_progress).toBe(false);
    } finally {
      fetch.restore();
      storage.close();
    }
  });

  it("permanent 503 on Workflow text step makes exactly 3 fetch calls (R5)", async () => {
    const storage = await openMigratedDatabase();
    const fetch = installChatFetch([
      () => new Response("unavailable", { status: 503 }),
    ]);
    try {
      const { requestId, step, callCount } = await runLockedDeepInfraWorkflow(
        storage,
        fetch,
      );
      expect(step.attempts.get("text")).toBe(3);
      expect(callCount).toBe(3);
      expect(requestId).toBeTruthy();
    } finally {
      fetch.restore();
      storage.close();
    }
  });

  it("redraft resume path permanent 503 makes exactly 3 fetch calls (R6)", async () => {
    const storage = await openMigratedDatabase();
    const fetch = installChatFetch([
      () => new Response("unavailable", { status: 503 }),
    ]);
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-wf-redraft"),
        "redraft@ex.com",
      );
      const requestId = testOpaqueEntityId("wf-redraft-req");
      const exerciseId = await seedExercise(storage, practitioner, id("ex-wf-redraft"));
      const versionId = id("ver-wf-redraft");
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: practitioner,
        requestedName: "Redraft resume",
      });
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({ id: versionId, exercise_id: exerciseId }),
      );
      await storage.run(`UPDATE exercise_requests SET exercise_id = ? WHERE id = ?`, [
        exerciseId,
        requestId,
      ]);
      const attemptId = crypto.randomUUID();
      const lockedAt = new Date().toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [lockedAt, attemptId, requestId],
      );
      const draftGenerator = createDeepInfraExerciseDraftGenerator({
        apiKey: "wf-redraft-key",
      });
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "redraft@ex.com",
          displayName: "Coach",
        },
      });
      vi.mocked(createWorkerProductionAppDependencies).mockReturnValue({
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: draftGenerator,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      } as never);
      const workflow = new ExerciseRequestDraftGenerationWorkflow(
        { waitUntil() {} } as FakeExecutionContext,
        {} as never,
      );
      const step = new RecordingWorkflowStep();
      try {
        await workflow.run(
          {
            payload: { requestId, practitionerId: practitioner, attemptId },
            timestamp: new Date(),
            instanceId: `${requestId}:${attemptId}`,
          },
          step as never,
        );
      } catch {
        // exhausted
      }
      expect(step.attempts.get("text")).toBe(3);
      expect(fetch.callCount()).toBe(3);
    } finally {
      fetch.restore();
      storage.close();
    }
  });

  it("401 makes exactly 1 fetch call", async () => {
    const storage = await openMigratedDatabase();
    const fetch = installChatFetch([
      () => new Response("unauthorized", { status: 401 }),
    ]);
    try {
      const { service, requestId, step, callCount } = await runLockedDeepInfraWorkflow(
        storage,
        fetch,
      );
      expect(step.attempts.get("text")).toBe(1);
      expect(callCount).toBe(1);
      const after = await service.loadDraftView(requestId);
      expect(after.generation.generation_failure).toBe("text");
    } finally {
      fetch.restore();
      storage.close();
    }
  });
});
