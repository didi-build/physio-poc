import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
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
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
} from "./helpers/draft-generation-test-workflow.js";
import {
  createTestDraftGenerationWorkflowPort,
  generateRequestAndDrainWorkflow,
} from "./helpers/test-draft-generation-workflow-port.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

function testDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator: ReturnType<typeof createDeepInfraExerciseDraftGenerator>,
) {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "H" },
  });
  const objects = new InMemoryObjectStorage();
  const baseDeps = {
    sql: storage,
    objects,
    config: MCP_TEST_CONFIG,
    auth,
    mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    exerciseDraftGenerator,
  };
  const requestService = new ExerciseRequestsService(baseDeps.sql, baseDeps.config, {
    draftGenerator: exerciseDraftGenerator,
  });
  const { deps: bundle, workflow } = attachDraftGenerationTestWorkflow(
    baseDeps,
    (requestId) => requestService.loadDraftView(requestId),
  );
  return {
    bundle,
    workflow,
    cookie: auth.createSessionCookieHeader(),
    requestService,
    objects,
    practitionerId,
  };
}

describe("Exercise requests submit upstream AI failure (DIDI-1008)", () => {
  it("returns 502 with typed error code without passing provider HTTP status", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-http-502"),
        "h502@example.com",
      );
      const fetchImpl = vi
        .fn()
        .mockImplementation(() => new Response("{}", { status: 503 }));
      const generator = createDeepInfraExerciseDraftGenerator({
        apiKey: "key",
        fetchImpl,
      });
      const { bundle, workflow, cookie, requestService, objects, practitionerId } =
        testDeps(storage, practitioner, "h502@example.com", generator);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Upstream fail",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const createdBody = (await created.json()) as { request_id: string };
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(createdBody.request_id), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        bundle,
      );
      expect(response.status).toBe(202);
      await drainDraftGeneration(workflow, createdBody.request_id);

      const secondCreated = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Upstream fail sync pin",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const secondBody = (await secondCreated.json()) as { request_id: string };
      fetchImpl.mockClear();
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(objects),
      );
      const syncWorkflow = createTestDraftGenerationWorkflowPort({
        sql: storage,
        loadView: (requestId) => requestService.loadDraftView(requestId),
        draftGenerator: generator,
        mediaService,
      });
      const payload = await generateRequestAndDrainWorkflow({
        service: requestService,
        practitionerId,
        requestId: secondBody.request_id,
        mediaService,
        workflow: syncWorkflow,
      });
      const EXPECTED_UPSTREAM_FAIL = {
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
        view: null,
      } as const;
      expect(payload).toEqual(EXPECTED_UPSTREAM_FAIL);
      expect(JSON.stringify(payload)).not.toContain("key");
    } finally {
      storage.close();
    }
  });

  it("returns 502 when the model alias looks like an email (E01)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-http-email-alias"),
        "e01@example.com",
      );
      const emailAliasDraft = {
        title: "Heel slide",
        aliases: ["jane@example.com"],
        category: "stretch",
        body_regions: ["knee"],
        description: "Gentle knee flexion stretch.",
        equipment: "Mat",
        starting_position: "Supine on mat.",
        steps: "1. Bend knee",
        common_mistakes: "Rushing",
        regressions: "Smaller range",
        progressions: "Hold longer",
        precautions: "Stop if pain",
        cue_stretching: "Move slowly",
        cue_isometric: null,
        cue_concentric: null,
        cue_eccentric: null,
      };
      const fetchImpl = vi.fn().mockImplementation(
        () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(emailAliasDraft) } }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      );
      const generator = createDeepInfraExerciseDraftGenerator({
        apiKey: "key",
        fetchImpl,
      });
      const { bundle, workflow, cookie, requestService, objects, practitionerId } =
        testDeps(storage, practitioner, "e01@example.com", generator);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Email alias draft",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const createdBody = (await created.json()) as { request_id: string };
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(createdBody.request_id), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        bundle,
      );
      expect(response.status).toBe(202);
      await drainDraftGeneration(workflow, createdBody.request_id);
      expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(1);

      const secondCreated = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Email alias draft retry",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const secondBody = (await secondCreated.json()) as { request_id: string };
      fetchImpl.mockClear();
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(objects),
      );
      const syncWorkflow = createTestDraftGenerationWorkflowPort({
        sql: storage,
        loadView: (requestId) => requestService.loadDraftView(requestId),
        draftGenerator: generator,
        mediaService,
      });
      const payload = await generateRequestAndDrainWorkflow({
        service: requestService,
        practitionerId,
        requestId: secondBody.request_id,
        mediaService,
        workflow: syncWorkflow,
      });
      expect(payload).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_response_invalid",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });
});
