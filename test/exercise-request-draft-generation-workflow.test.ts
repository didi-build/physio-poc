import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/adapters/workers/create-worker-production-app-dependencies.js", () => ({
  createWorkerProductionAppDependencies: vi.fn(),
}));

import { NonRetryableError } from "./helpers/cloudflare-workers-vitest-shim.js";
import {
  DRAFT_GENERATION_WORKFLOW_STEP_RETRY,
  ExerciseRequestDraftGenerationWorkflow,
} from "../src/adapters/workers/exercise-request-draft-generation-workflow.js";
import type { DraftGenerationStepName } from "../src/services/exercise-requests/draft-generation-lock-log.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedPractitioner,
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
    exerciseMediaImages: new FakeImageGeneration(),
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
