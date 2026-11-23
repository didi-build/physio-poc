import { describe, expect, it, vi } from "vitest";

vi.mock("../src/adapters/workers/create-worker-production-app-dependencies.js", () => ({
  createWorkerProductionAppDependencies: () => ({
    sql: {},
    config: {},
    exerciseDraftGenerator: {},
    exerciseMediaImages: {},
  }),
}));
import { NonRetryableError } from "./helpers/cloudflare-workers-vitest-shim.js";
import { ExerciseRequestDraftGenerationWorkflow } from "../src/adapters/workers/exercise-request-draft-generation-workflow.js";
import type { DraftGenerationStepName } from "../src/services/exercise-requests/draft-generation-lock-log.js";

type FakeExecutionContext = { waitUntil: (_promise: Promise<unknown>) => void };

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
    const limit = config?.retries?.limit ?? 1;
    if (this.completed.has(name)) {
      return this.completed.get(name) as T;
    }
    let lastError: unknown;
    for (let attempt = 1; attempt <= limit; attempt += 1) {
      this.attempts.set(name, attempt);
      try {
        const value = await fn();
        this.completed.set(name, value);
        return value;
      } catch (error) {
        lastError = error;
        if (error instanceof NonRetryableError) {
          throw error;
        }
      }
    }
    throw lastError;
  }
}

describe("ExerciseRequestDraftGenerationWorkflow.run", () => {
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
    ).rejects.toBeInstanceOf(NonRetryableError);
    expect(step.attempts.get("text")).toBe(1);
  });
});
