import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import type { AppDependencies } from "../src/http/app.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import {
  createDelayedFakeExerciseDraftGenerator,
  fakeExerciseDraftGenerator,
} from "../src/services/exercise-requests/fake-draft-generator.js";
import { DRAFT_GENERATION_LOCK_STALE_MS } from "../src/services/exercise-requests/draft-generation-lock.js";
import {
  DRAFT_GENERATION_LOCK_REFRESHED_EVENT,
  DRAFT_GENERATION_LOCK_RELEASED_EVENT,
  DRAFT_GENERATION_STEP_ENDED_EVENT,
} from "../src/services/exercise-requests/draft-generation-lock-log.js";
import { createInProcessDraftGenerationWorkflowPort } from "../src/services/exercise-requests/in-process-draft-generation-workflow.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import type { ImageGenerationPort } from "../src/storage/ports/image-generation.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
} from "./helpers/draft-generation-test-workflow.js";

const PIN_STALE_MS = 3 * 60 * 1000;

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

class CountingImageGeneration extends FakeImageGeneration {
  startCalls = 0;
  endCalls = 0;
  pairCalls = 0;

  override async generateStartImage(
    ...args: Parameters<FakeImageGeneration["generateStartImage"]>
  ) {
    this.startCalls += 1;
    return super.generateStartImage(...args);
  }

  override async generateEndImage(
    ...args: Parameters<FakeImageGeneration["generateEndImage"]>
  ) {
    this.endCalls += 1;
    return super.generateEndImage(...args);
  }

  override async generateStartAndEndImages(
    ...args: Parameters<FakeImageGeneration["generateStartAndEndImages"]>
  ) {
    this.pairCalls += 1;
    return super.generateStartAndEndImages(...args);
  }
}

describe("DIDI-1289 off-request-path draft generation", () => {
  let logSpy: MockInstance;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function testBundle(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    practitioner: string,
    images: ImageGenerationPort,
    stopAfterStep?: "text" | "start_image",
  ) {
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: practitioner,
        email: "a@ex.com",
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
    const objects = base.objects;
    const mediaService = new ExerciseMediaService(
      base.sql,
      images,
      new PrefixMediaStorage(objects),
    );
    const requestService = new ExerciseRequestsService(base.sql, base.config, {
      draftGenerator: fakeExerciseDraftGenerator,
      initialDraftMediaProgress: (versionId) =>
        mediaService.getInitialDraftMediaProgress(versionId),
    });
    const { deps, workflow } = attachDraftGenerationTestWorkflow(
      base,
      (requestId) => requestService.loadDraftView(requestId),
      stopAfterStep ? { stopAfterStep } : undefined,
    );
    return { deps, cookie: auth.createSessionCookieHeader(), workflow, practitioner };
  }

  async function createRequest(cookie: string, bundle: AppDependencies) {
    const created = await handleRequest(
      authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
        method: "POST",
        body: JSON.stringify({
          requested_name: "Sumo squat",
          form_opened_at: FORM_OPENED,
        }),
      }),
      bundle,
    );
    const body = (await created.json()) as { request_id: string };
    return body.request_id;
  }

  it("pins stale window at 3 * 60 * 1000 ms (180000)", () => {
    expect(DRAFT_GENERATION_LOCK_STALE_MS).toBe(PIN_STALE_MS);
    expect(DRAFT_GENERATION_LOCK_STALE_MS).toBe(180_000);
  });

  it("POST /generate returns 202 in_progress immediately then completes off-request", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-immediate"),
        "a@ex.com",
      );
      const images = new CountingImageGeneration();
      const { deps, cookie, workflow } = testBundle(storage, practitioner, images);
      const requestId = await createRequest(cookie, deps);
      const started = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(started.status).toBe(202);
      await expect(started.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      await drainDraftGeneration(workflow, requestId);
      const view = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const body = (await view.json()) as {
        generation: { first_draft_complete: boolean };
      };
      expect(body.generation.first_draft_complete).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("refreshes lock heartbeat between generation steps", async () => {
    const storage = await openMigratedDatabase();
    try {
      const refreshSpy = vi.spyOn(
        ExerciseRequestsRepository.prototype,
        "refreshDraftGenerationLock",
      );
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-heartbeat"),
        "hb@ex.com",
      );
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      await drainDraftGeneration(workflow, requestId);
      expect(refreshSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
      const lines = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line): line is string => typeof line === "string");
      const refreshed = lines
        .map((line) => JSON.parse(line) as { event: string })
        .filter((row) => row.event === DRAFT_GENERATION_LOCK_REFRESHED_EVENT);
      expect(refreshed.length).toBeGreaterThanOrEqual(3);
      refreshSpy.mockRestore();
    } finally {
      storage.close();
    }
  });

  it("workflow port returns already_running for duplicate start", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-wf-port"),
        "wf@ex.com",
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "wf@ex.com",
          displayName: "Coach",
        },
      });
      const base: AppDependencies = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const requestService = new ExerciseRequestsService(base.sql, base.config, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const cookie = auth.createSessionCookieHeader();
      const { deps } = attachDraftGenerationTestWorkflow(base, (requestId) =>
        requestService.loadDraftView(requestId),
      );
      const requestId = await createRequest(cookie, deps);
      const direct = createInProcessDraftGenerationWorkflowPort(() => ({
        deps,
        loadView: (rid) => requestService.loadDraftView(rid),
        draftGenerator: fakeExerciseDraftGenerator,
      }));
      const first = await direct.start({
        requestId,
        practitionerId: practitioner,
      });
      const second = await direct.start({
        requestId,
        practitionerId: practitioner,
      });
      expect(first).toBe("started");
      expect(second).toBe("already_running");
      await direct.drain(requestId);
    } finally {
      storage.close();
    }
  });

  it("duplicate start does not create a second workflow run", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-dupe"),
        "b@ex.com",
      );
      const slowDraft = createDelayedFakeExerciseDraftGenerator({ delayMs: 400 });
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "b@ex.com",
          displayName: "Coach",
        },
      });
      const base = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: slowDraft,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const requestService = new ExerciseRequestsService(base.sql, base.config, {
        draftGenerator: slowDraft,
      });
      const { deps, workflow } = attachDraftGenerationTestWorkflow(base, (requestId) =>
        requestService.loadDraftView(requestId),
      );
      const cookie = auth.createSessionCookieHeader();
      const requestId = await createRequest(cookie, deps);
      const first = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(first.status).toBe(202);
      expect(workflow.inflightRequestIds()).toEqual([requestId]);
      const second = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(second.status).toBe(202);
      await expect(second.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: true,
      });
      expect(workflow.inflightRequestIds()).toEqual([requestId]);
    } finally {
      storage.close();
    }
  });

  it("cancel after text: GET not in progress after stale boundary; resume skips text", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-text"),
        "c@ex.com",
      );
      const images = new CountingImageGeneration();
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        images,
        "text",
      );
      const requestId = await createRequest(cookie, deps);
      const started = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(started.status).toBe(202);
      await drainDraftGeneration(workflow, requestId);
      expect(images.startCalls).toBe(0);
      const staleBefore = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 1_000,
      ).toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [staleBefore, requestId],
      );
      const getMid = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const mid = (await getMid.json()) as {
        generation: { generation_in_progress: boolean };
      };
      expect(mid.generation.generation_in_progress).toBe(false);
      const { workflow: resumeWorkflow } = attachDraftGenerationTestWorkflow(
        deps,
        (rid) =>
          new ExerciseRequestsService(deps.sql, deps.config, {
            draftGenerator: fakeExerciseDraftGenerator,
          }).loadDraftView(rid),
      );
      const retry = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        { ...deps, draftGenerationWorkflow: resumeWorkflow },
      );
      expect(retry.status).toBe(202);
      await drainDraftGeneration(resumeWorkflow, requestId);
      expect(images.startCalls).toBe(1);
      expect(images.endCalls).toBe(1);
      expect(images.pairCalls).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("cancel after start image: resume skips text and first image fetch calls", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-start-img"),
        "img@ex.com",
      );
      const images = new CountingImageGeneration();
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        images,
        "start_image",
      );
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      await drainDraftGeneration(workflow, requestId);
      expect(images.startCalls).toBe(1);
      expect(images.endCalls).toBe(0);
      const staleBefore = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 1_000,
      ).toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [staleBefore, requestId],
      );
      const { workflow: resumeWorkflow } = attachDraftGenerationTestWorkflow(
        deps,
        (rid) =>
          new ExerciseRequestsService(deps.sql, deps.config, {
            draftGenerator: fakeExerciseDraftGenerator,
          }).loadDraftView(rid),
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        { ...deps, draftGenerationWorkflow: resumeWorkflow },
      );
      await drainDraftGeneration(resumeWorkflow, requestId);
      expect(images.startCalls).toBe(1);
      expect(images.endCalls).toBe(1);
      expect(images.pairCalls).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("first /generate is not charged toward daily media quota; canceled run leaves quota unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-quota"),
        "d@ex.com",
      );
      const capExerciseId = await seedExercise(storage, practitioner);
      for (let i = 0; i < 5; i += 1) {
        await storage.run(
          `INSERT INTO media_regenerations (
            id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id(`regen-1289-${i}`),
            practitioner,
            capExerciseId,
            null,
            "both",
            0,
            FORM_OPENED,
          ],
        );
      }
      const images = new CountingImageGeneration();
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        images,
        "start_image",
      );
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      await drainDraftGeneration(workflow, requestId);
      const count = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM media_regenerations WHERE practitioner_id = ?",
        [practitioner],
      );
      expect(count?.c).toBe(5);
    } finally {
      storage.close();
    }
  });

  it("resume after partial run does not charge media quota twice", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-quota-resume"),
        "qr@ex.com",
      );
      const images = new CountingImageGeneration();
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        images,
        "start_image",
      );
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      await drainDraftGeneration(workflow, requestId);
      const before = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM media_regenerations WHERE practitioner_id = ?",
        [practitioner],
      );
      expect(before?.c).toBe(0);
      const staleBefore = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 1_000,
      ).toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [staleBefore, requestId],
      );
      const requestService = new ExerciseRequestsService(deps.sql, deps.config, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const { workflow: resumeWorkflow } = attachDraftGenerationTestWorkflow(
        deps,
        (rid) => requestService.loadDraftView(rid),
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        { ...deps, draftGenerationWorkflow: resumeWorkflow },
      );
      await drainDraftGeneration(resumeWorkflow, requestId);
      const after = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM media_regenerations WHERE practitioner_id = ?",
        [practitioner],
      );
      expect(after?.c).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("emits step end logs with duration_ms", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-logs"),
        "e@ex.com",
      );
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      await drainDraftGeneration(workflow, requestId);
      const lines = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line): line is string => typeof line === "string");
      const stepEnds = lines
        .map((line) => JSON.parse(line) as { event: string; duration_ms?: number })
        .filter((row) => row.event === DRAFT_GENERATION_STEP_ENDED_EVENT);
      expect(stepEnds.length).toBeGreaterThan(0);
      expect(stepEnds.every((row) => typeof row.duration_ms === "number")).toBe(true);
      expect(
        lines.some((line) => {
          const row = JSON.parse(line) as { event: string };
          return row.event === DRAFT_GENERATION_LOCK_RELEASED_EVENT;
        }),
      ).toBe(true);
    } finally {
      storage.close();
    }
  });
});
