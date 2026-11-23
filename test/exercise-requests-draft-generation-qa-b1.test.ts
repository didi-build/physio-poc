import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { createWorkerDraftGenerationWorkflowPort } from "../src/adapters/workers/worker-draft-generation-workflow-port.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { DeepInfraExerciseDraftError } from "../src/services/exercise-requests/deepinfra-exercise-draft-error.js";
import type { ExerciseDraftGenerator } from "../src/services/exercise-requests/exercise-draft-generator-types.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { createRetainedCloudflareWorkflowBinding } from "./helpers/cloudflare-retained-workflow-binding.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { WORKFLOW_INSTANCE_ALREADY_EXISTS_ID } from "../src/services/exercise-requests/workflow-instance-already-exists.js";

const BASE = "https://physio.test.example";

function req(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

describe("QA B1: one workflow instance id per attempt", () => {
  it("retry after a finished attempt starts a new instance and completes the draft", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-qa-b1"), "b1@ex.com");
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "b1@ex.com",
          displayName: "Coach",
        },
      });
      let generator: ExerciseDraftGenerator = async () => {
        throw new DeepInfraExerciseDraftError(
          "deepinfra_exercise_draft_request_failed",
        );
      };
      const base = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        get exerciseDraftGenerator() {
          return generator;
        },
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const requestService = new ExerciseRequestsService(base.sql, base.config, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const { binding, instances, drain } = createRetainedCloudflareWorkflowBinding({
        getDeps: () => base,
        loadView: (requestId) => requestService.loadDraftView(requestId),
      });
      const deps = {
        ...base,
        draftGenerationWorkflow: createWorkerDraftGenerationWorkflowPort({
          PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION: binding,
        } as never),
      };
      const cookie = auth.createSessionCookieHeader();
      const created = await handleRequest(
        req(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Sumo squat",
            form_opened_at: "2026-10-30T10:00:00.000Z",
          }),
        }),
        deps,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };

      const first = await handleRequest(
        req(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        deps,
      );
      expect(first.status).toBe(202);
      expect(await first.json()).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      await drain();
      expect(instances.size).toBe(1);
      const firstInstanceId = [...instances][0]!;
      expect(firstInstanceId.startsWith(`${requestId}:`)).toBe(true);

      generator = fakeExerciseDraftGenerator;

      const retry = await handleRequest(
        req(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        deps,
      );
      expect(retry.status).toBe(202);
      expect(await retry.json()).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      expect(instances.size).toBe(2);
      await drain();

      const view = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const body = (await view.json()) as {
        draft: unknown;
        generation: { generation_in_progress: boolean; first_draft_complete: boolean };
      };
      expect(body.generation.generation_in_progress).toBe(false);
      expect(body.generation.first_draft_complete).toBe(true);
      expect(body.draft).not.toBeNull();

      expect([...instances].every((key) => key.startsWith(`${requestId}:`))).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("create() throw releases lock and returns typed 502, never 202", async () => {
    const storage = await openMigratedDatabase();
    try {
      const instances = new Set<string>();
      const binding = {
        async create(createInput: { id: string }) {
          if (instances.has(createInput.id)) {
            throw new Error(
              `${WORKFLOW_INSTANCE_ALREADY_EXISTS_ID} An instance with this ID already exists`,
            );
          }
          instances.add(createInput.id);
          throw new Error("rate_limited");
        },
        async get() {
          return {};
        },
      };
      const practitioner = await seedPractitioner(
        storage,
        id("pr-b1-throw"),
        "x@ex.com",
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "x@ex.com",
          displayName: "Coach",
        },
      });
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
        draftGenerationWorkflow: createWorkerDraftGenerationWorkflowPort({
          PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION: binding,
        } as never),
      };
      const cookie = auth.createSessionCookieHeader();
      const created = await handleRequest(
        req(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Sumo squat",
            form_opened_at: "2026-10-30T10:00:00.000Z",
          }),
        }),
        deps,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      const response = await handleRequest(
        req(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        deps,
      );
      expect(response.status).toBe(502);
      const requests = new ExerciseRequestsRepository(storage);
      expect(await requests.getDraftGenerationLockedAt(requestId)).toBeNull();
    } finally {
      storage.close();
    }
  });
});
