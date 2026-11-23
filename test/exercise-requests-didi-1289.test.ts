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
  exerciseRequestWithdrawPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import {
  createDelayedFakeExerciseDraftGenerator,
  fakeExerciseDraftGenerator,
} from "../src/services/exercise-requests/fake-draft-generator.js";
import type { ExerciseDraftGenerator } from "../src/services/exercise-requests/exercise-draft-generator-types.js";
import { DRAFT_GENERATION_LOCK_STALE_MS } from "../src/services/exercise-requests/draft-generation-lock.js";
import {
  DRAFT_GENERATION_LOCK_REFRESHED_EVENT,
  DRAFT_GENERATION_LOCK_RELEASED_EVENT,
  DRAFT_GENERATION_RUN_ABANDONED_EVENT,
  DRAFT_GENERATION_RUN_CANCELED_EVENT,
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
import { runExerciseRequestDraftGeneration } from "../src/services/exercise-requests/run-exercise-request-draft-generation.js";
import {
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../src/storage/repositories/exercise-data.js";
import { ExerciseVersionMediaRepository } from "../src/storage/repositories/exercise-media.js";
import { ExerciseRequestsServiceError } from "../src/services/exercise-requests/errors.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
  type DraftGenerationTestWorkflowHandle,
} from "./helpers/draft-generation-test-workflow.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import { DeepInfraFluxKleinImageGeneration } from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { installDidi1289DeepInfraFetchStub } from "./helpers/didi-1289-deepinfra-fetch-stub.js";

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

  it("fresh drafting request GET has no generation_failure (N27/N28)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-fresh-gf"),
        "fresh-gf@ex.com",
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "fresh-gf@ex.com",
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
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const { deps } = attachDraftGenerationTestWorkflow(base, (requestId) =>
        new ExerciseRequestsService(base.sql, base.config, {
          draftGenerator: fakeExerciseDraftGenerator,
        }).loadDraftView(requestId),
      );
      const cookie = auth.createSessionCookieHeader();
      const requestId = await createRequest(cookie, deps);
      const getRes = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      expect(getRes.status).toBe(200);
      const body = (await getRes.json()) as {
        generation: {
          generation_failure: string | null;
          generation_failure_code: string | null;
        };
      };
      expect(body.generation.generation_failure ?? null).toBeNull();
      expect(body.generation.generation_failure_code ?? null).toBeNull();
      const raw = await storage.first<{
        draft_generation_attempt_id: string | null;
        draft_generation_failure_code: string | null;
      }>(
        `SELECT draft_generation_attempt_id, draft_generation_failure_code
         FROM exercise_requests WHERE id = ?`,
        [requestId],
      );
      expect(raw?.draft_generation_attempt_id ?? null).toBeNull();
      expect(raw?.draft_generation_failure_code ?? null).toBeNull();
    } finally {
      storage.close();
    }
  });

  function testBundle(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    practitioner: string,
    images: ImageGenerationPort,
    stopAfterStep?: "text" | "start_image",
    draftGenerator: ExerciseDraftGenerator = fakeExerciseDraftGenerator,
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
      exerciseDraftGenerator: draftGenerator,
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
      draftGenerator,
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

  it("workflow port rejects duplicate instance id", async () => {
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
      const attemptId = id("att-dup");
      const first = await direct.start({
        requestId,
        practitionerId: practitioner,
        attemptId,
      });
      expect(first).toBe("started");
      await expect(
        direct.start({ requestId, practitionerId: practitioner, attemptId }),
      ).rejects.toThrow("(instance.already_exists)");
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
      const inflightAfterFirst = workflow
        .inflightInstanceIds()
        .filter((key) => key.startsWith(`${requestId}:`));
      expect(inflightAfterFirst).toHaveLength(1);
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
      const inflightAfterSecond = workflow
        .inflightInstanceIds()
        .filter((key) => key.startsWith(`${requestId}:`));
      expect(inflightAfterSecond).toHaveLength(1);
      expect(inflightAfterSecond[0]).toBe(inflightAfterFirst[0]);
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
      const canceledOnChunkStop = logSpy.mock.calls.some((call) => {
        const line = call[0];
        if (typeof line !== "string") {
          return false;
        }
        const row = JSON.parse(line) as { event: string };
        return row.event === DRAFT_GENERATION_RUN_CANCELED_EVENT;
      });
      expect(canceledOnChunkStop).toBe(false);
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

  it("GET treats lock age exactly at 180000 ms as not in progress (kills M04)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-m04"),
        "m04@ex.com",
      );
      const { deps, cookie } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const requestId = await createRequest(cookie, deps);
      const exactlyStale = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS,
      ).toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [exactlyStale, requestId],
      );
      const getRes = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const body = (await getRes.json()) as {
        generation: { generation_in_progress: boolean };
      };
      expect(body.generation.generation_in_progress).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("heartbeat refresh advances locked_at with strict ordering (kills M11/M12/R15)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const start = new Date("2026-10-30T10:00:00.000Z");
    vi.setSystemTime(start);
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-hb-age"),
        "hb-age@ex.com",
      );
      const slowDraft = createDelayedFakeExerciseDraftGenerator({ delayMs: 64 });
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
        undefined,
        slowDraft,
      );
      const requestId = await createRequest(cookie, deps);
      const repo = new ExerciseRequestsRepository(deps.sql);
      const refreshLockedAt: string[] = [];
      const refreshWallMs: number[] = [];
      const storedLockedAtAfterRefresh: string[] = [];
      const refreshBase =
        ExerciseRequestsRepository.prototype.refreshDraftGenerationLock;
      vi.spyOn(
        ExerciseRequestsRepository.prototype,
        "refreshDraftGenerationLock",
      ).mockImplementation(async function (
        this: ExerciseRequestsRepository,
        input: Parameters<ExerciseRequestsRepository["refreshDraftGenerationLock"]>[0],
      ) {
        refreshWallMs.push(Date.now());
        refreshLockedAt.push(input.lockedAt);
        const result = await refreshBase.call(this, input);
        const stored = await storage.first<{
          draft_generation_locked_at: string | null;
        }>("SELECT draft_generation_locked_at FROM exercise_requests WHERE id = ?", [
          input.requestId,
        ]);
        if (stored?.draft_generation_locked_at) {
          storedLockedAtAfterRefresh.push(stored.draft_generation_locked_at);
        }
        return result;
      });
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const acquiredAt = await repo.getDraftGenerationLockedAt(requestId);
      expect(acquiredAt).toBeTruthy();
      const drainPromise = drainDraftGeneration(workflow, requestId);
      await vi.runAllTimersAsync();
      await drainPromise;
      expect(refreshLockedAt.length).toBeGreaterThan(0);
      expect(storedLockedAtAfterRefresh.length).toBe(refreshLockedAt.length);
      for (let i = 0; i < refreshLockedAt.length; i += 1) {
        expect(storedLockedAtAfterRefresh[i]).toBe(refreshLockedAt[i]);
        expect(Date.parse(refreshLockedAt[i]!)).toBeGreaterThan(
          Date.parse(acquiredAt!),
        );
        expect(
          Math.abs(Date.parse(refreshLockedAt[i]!) - refreshWallMs[i]!),
        ).toBeLessThan(5_000);
      }
      expect(
        Date.parse(refreshLockedAt[refreshLockedAt.length - 1]!),
      ).toBeGreaterThanOrEqual(Date.parse(refreshLockedAt[0]!));
      const row = await storage.first<{ draft_generation_locked_at: string | null }>(
        "SELECT draft_generation_locked_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.draft_generation_locked_at).toBeNull();
      expect(Date.parse(refreshLockedAt[refreshLockedAt.length - 1]!)).toBeGreaterThan(
        Date.parse(acquiredAt!),
      );
      const lines = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line): line is string => typeof line === "string");
      const refreshed = lines
        .map(
          (line) => JSON.parse(line) as { event: string; lock_age_ms: number | null },
        )
        .filter((row) => row.event === "physio_draft_generation_lock_refreshed");
      expect(refreshed.length).toBeGreaterThan(0);
      expect(refreshed.some((row) => (row.lock_age_ms ?? -1) >= 0)).toBe(true);
      expect(
        refreshed.every(
          (row) => row.event === "physio_draft_generation_lock_refreshed",
        ),
      ).toBe(true);
      const stepStarted = lines.some((line) => {
        const row = JSON.parse(line) as { event: string };
        return row.event === "physio_draft_generation_step_started";
      });
      expect(stepStarted).toBe(true);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      storage.close();
    }
  });

  it("emits step end logs with duration_ms", async () => {
    const TEXT_STEP_DELAY_MS = 64;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-logs"),
        "e@ex.com",
      );
      const delayedText = createDelayedFakeExerciseDraftGenerator({
        delayMs: TEXT_STEP_DELAY_MS,
      });
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
        undefined,
        delayedText,
      );
      const requestId = await createRequest(cookie, deps);
      const generatePromise = handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const drainPromise = drainDraftGeneration(workflow, requestId);
      await generatePromise;
      await vi.runAllTimersAsync();
      await drainPromise;
      const lines = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line): line is string => typeof line === "string");
      const stepEnds = lines
        .map(
          (line) =>
            JSON.parse(line) as {
              event: string;
              step?: string;
              duration_ms?: number;
            },
        )
        .filter((row) => row.event === DRAFT_GENERATION_STEP_ENDED_EVENT);
      expect(stepEnds.length).toBeGreaterThan(0);
      expect(stepEnds.every((row) => typeof row.duration_ms === "number")).toBe(true);
      const textEnded = stepEnds.find((row) => row.step === "text");
      expect(textEnded?.duration_ms).toBe(TEXT_STEP_DELAY_MS);
      expect(
        lines.some((line) => {
          const row = JSON.parse(line) as { event: string };
          return row.event === DRAFT_GENERATION_LOCK_RELEASED_EVENT;
        }),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
      storage.close();
    }
  });

  it("GET exposes draft_generation_locked_at while generation is in flight (N30)", async () => {
    const storage = await openMigratedDatabase();
    let requestId: string | undefined;
    let workflow: DraftGenerationTestWorkflowHandle | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-get-lock"),
        "get-lock@ex.com",
      );
      const slowDraft = createDelayedFakeExerciseDraftGenerator({ delayMs: 150 });
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "get-lock@ex.com",
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
      const bundle = attachDraftGenerationTestWorkflow(base, (rid) =>
        requestService.loadDraftView(rid),
      );
      workflow = bundle.workflow;
      const { deps } = bundle;
      const cookie = auth.createSessionCookieHeader();
      requestId = await createRequest(cookie, deps);
      const postRes = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(postRes.status).toBe(202);
      const getRes = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const body = (await getRes.json()) as {
        generation: {
          generation_in_progress: boolean;
          draft_generation_locked_at: string | null;
        };
      };
      expect(body.generation.generation_in_progress).toBe(true);
      expect(body.generation.draft_generation_locked_at).toBeTruthy();
    } finally {
      if (workflow && requestId) {
        await drainDraftGeneration(workflow, requestId).catch(() => undefined);
      }
      storage.close();
    }
  });

  it("attempt-scoped failure write and acquire clear prior code (N03/N05)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-att-guard"),
        "att-guard@ex.com",
      );
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const repo = new ExerciseRequestsRepository(deps.sql);
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const attemptA = await repo.getDraftGenerationAttemptId(requestId);
      expect(attemptA).toBeTruthy();
      const attemptB = id("att-b");
      const wrongAttempt = await repo.setDraftGenerationFailure({
        requestId,
        attemptId: attemptB,
        failureCode: "text_failed",
      });
      expect(wrongAttempt).toBe(false);
      expect(
        (await repo.findById(requestId))?.draft_generation_failure_code ?? null,
      ).toBeNull();
      await repo.setDraftGenerationFailure({
        requestId,
        attemptId: attemptA!,
        failureCode: "text_failed",
      });
      await drainDraftGeneration(workflow, requestId);

      const isolatedRequestId = await createRequest(cookie, deps);
      const staleAttempt = id("att-stale-failure");
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_attempt_id = ?, draft_generation_failure_code = ?
         WHERE id = ?`,
        [staleAttempt, "text_failed", isolatedRequestId],
      );
      const staleBefore = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS,
      ).toISOString();
      const acquired = await repo.tryAcquireDraftGenerationLock({
        requestId: isolatedRequestId,
        lockedAt: new Date().toISOString(),
        staleBefore,
        attemptId: attemptB,
      });
      expect(acquired).toBe(true);
      expect(
        (await repo.findById(isolatedRequestId))?.draft_generation_failure_code ?? null,
      ).toBeNull();

      const refreshRequestId = await createRequest(cookie, deps);
      await repo.tryAcquireDraftGenerationLock({
        requestId: refreshRequestId,
        lockedAt: new Date().toISOString(),
        staleBefore,
        attemptId: attemptA!,
      });
      const refreshed = await repo.refreshDraftGenerationLock({
        requestId: refreshRequestId,
        lockedAt: new Date().toISOString(),
        attemptId: attemptB,
      });
      expect(refreshed).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("superseded attempt during run does not complete generation (N19)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-superseded"),
        "sup@ex.com",
      );
      const images = new CountingImageGeneration();
      const repo = new ExerciseRequestsRepository(storage);
      const requestId = id("req-n19");
      const attemptId = id("att-n19");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, created_at, updated_at,
          draft_generation_locked_at, draft_generation_attempt_id
        ) VALUES (?, ?, NULL, ?, 'drafting', ?, ?, ?, ?)`,
        [
          requestId,
          "Squat",
          practitioner,
          FORM_OPENED,
          FORM_OPENED,
          FORM_OPENED,
          attemptId,
        ],
      );
      const refreshBase = repo.refreshDraftGenerationLock.bind(repo);
      let refreshCalls = 0;
      vi.spyOn(repo, "refreshDraftGenerationLock").mockImplementation(async (input) => {
        refreshCalls += 1;
        if (refreshCalls >= 2) {
          return false;
        }
        return refreshBase(input);
      });
      const mediaService = new ExerciseMediaService(
        storage,
        images,
        new PrefixMediaStorage(new InMemoryObjectStorage()),
      );
      const requestService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const requests = repo;
      const exercises = new ExercisesRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      const versionMedia = new ExerciseVersionMediaRepository(storage);
      await expect(
        runExerciseRequestDraftGeneration({
          practitionerId: practitioner,
          requestId,
          attemptId,
          mediaService,
          loadView: (rid) => requestService.loadDraftView(rid),
          deps: {
            sql: storage,
            draftGenerator: fakeExerciseDraftGenerator,
            now: () => new Date().toISOString(),
            requests,
            exercises,
            versions,
            versionMedia,
          },
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof ExerciseRequestsServiceError &&
          error.code === "draft_generation_in_progress",
      );
      expect(images.endCalls).toBe(0);
    } finally {
      vi.restoreAllMocks();
      storage.close();
    }
  });

  it("successful generation clears failure code for the same attempt (N18)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-clear-fail"),
        "clear@ex.com",
      );
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const repo = new ExerciseRequestsRepository(deps.sql);
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const attemptId = await repo.getDraftGenerationAttemptId(requestId);
      expect(attemptId).toBeTruthy();
      await repo.setDraftGenerationFailure({
        requestId,
        attemptId: attemptId!,
        failureCode: "text_failed",
      });
      await drainDraftGeneration(workflow, requestId);
      const getRes = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const body = (await getRes.json()) as {
        generation: {
          generation_failure: string | null;
          generation_failure_code: string | null;
          first_draft_complete: boolean;
        };
      };
      expect(body.generation.first_draft_complete).toBe(true);
      expect(body.generation.generation_failure ?? null).toBeNull();
      expect(body.generation.generation_failure_code ?? null).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("skips duplicate initial start image when progress is start_only (M16)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-m16"),
        "m16@ex.com",
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
      const row = await new ExerciseRequestsRepository(deps.sql).findById(requestId);
      expect(row?.exercise_id).toBeTruthy();
      const versionId = await deps.sql.first<{ id: string }>(
        `SELECT id FROM exercise_versions
         WHERE exercise_id = ? AND status = 'draft'
         ORDER BY version_number DESC LIMIT 1`,
        [row!.exercise_id!],
      );
      expect(versionId?.id).toBeTruthy();
      const mediaService = new ExerciseMediaService(
        deps.sql,
        images,
        new PrefixMediaStorage(deps.objects),
      );
      await mediaService.generateInitialStartImageForVersion({
        practitionerId: practitioner,
        exerciseVersionId: versionId!.id,
      });
      expect(images.startCalls).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("acquire stores a fresh attempt id on stale retry (N04)", async () => {
    const storage = await openMigratedDatabase();
    let requestId: string | undefined;
    let workflow: DraftGenerationTestWorkflowHandle | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-n04"),
        "n04@ex.com",
      );
      const bundle = testBundle(storage, practitioner, new FakeImageGeneration());
      workflow = bundle.workflow;
      const { deps, cookie } = bundle;
      const repo = new ExerciseRequestsRepository(deps.sql);
      requestId = await createRequest(cookie, deps);
      const staleAttempt = id("att-stale-n04");
      const staleLockedAt = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 5_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [staleLockedAt, staleAttempt, requestId],
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const stored = await repo.getDraftGenerationAttemptId(requestId);
      expect(stored).toBeTruthy();
      expect(stored).not.toBe(staleAttempt);
    } finally {
      if (workflow && requestId) {
        await drainDraftGeneration(workflow, requestId).catch(() => undefined);
      }
      storage.close();
    }
  });

  it("logs run_abandoned once when POST /generate takes a stale lock", async () => {
    const storage = await openMigratedDatabase();
    let requestId: string | undefined;
    let workflow: DraftGenerationTestWorkflowHandle | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-abandon-gen"),
        "abandon-gen@ex.com",
      );
      const bundle = testBundle(storage, practitioner, new FakeImageGeneration());
      workflow = bundle.workflow;
      const { deps, cookie } = bundle;
      requestId = await createRequest(cookie, deps);
      const priorAttempt = id("att-prior-abandon");
      const staleLockedAt = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 5_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [staleLockedAt, priorAttempt, requestId],
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const abandoned = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line): line is string => typeof line === "string")
        .map((line) => JSON.parse(line) as { event: string; attempt_id?: string })
        .filter((row) => row.event === DRAFT_GENERATION_RUN_ABANDONED_EVENT);
      expect(abandoned).toHaveLength(1);
      expect(abandoned[0]?.attempt_id).toBe(priorAttempt);
    } finally {
      if (workflow && requestId) {
        await drainDraftGeneration(workflow, requestId).catch(() => undefined);
      }
      storage.close();
    }
  });

  it("logs run_abandoned once when GET sees a stale lock", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-abandon-get"),
        "abandon-get@ex.com",
      );
      const { deps, cookie } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const requestId = await createRequest(cookie, deps);
      const priorAttempt = id("att-prior-get");
      const staleLockedAt = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 5_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [staleLockedAt, priorAttempt, requestId],
      );
      await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const abandoned = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line): line is string => typeof line === "string")
        .map((line) => JSON.parse(line) as { event: string; attempt_id?: string })
        .filter((row) => row.event === DRAFT_GENERATION_RUN_ABANDONED_EVENT);
      expect(abandoned).toHaveLength(1);
      expect(abandoned[0]?.attempt_id).toBe(priorAttempt);
    } finally {
      storage.close();
    }
  });

  it("logs run_canceled once when delete draft ends a stale running attempt", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-cancel"),
        "cancel@ex.com",
      );
      const { deps, cookie } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const repo = new ExerciseRequestsRepository(deps.sql);
      const requestId = await createRequest(cookie, deps);
      const attemptId = id("att-cancel");
      const staleLockedAt = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 5_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [staleLockedAt, attemptId, requestId],
      );
      const withdraw = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(withdraw.status).toBe(200);
      expect(await repo.getDraftGenerationAttemptId(requestId)).toBe(attemptId);
      const canceled = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line): line is string => typeof line === "string")
        .map((line) => JSON.parse(line) as { event: string; attempt_id?: string })
        .filter((row) => row.event === DRAFT_GENERATION_RUN_CANCELED_EVENT);
      expect(canceled).toHaveLength(1);
      expect(canceled[0]?.attempt_id).toBe(attemptId);
    } finally {
      storage.close();
    }
  });

  it("in-process port retains finished instance id (N31)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1289-retain"),
        "retain@ex.com",
      );
      const { deps, cookie, workflow } = testBundle(
        storage,
        practitioner,
        new FakeImageGeneration(),
      );
      const repo = new ExerciseRequestsRepository(deps.sql);
      const requestId = await createRequest(cookie, deps);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const attemptId = await repo.getDraftGenerationAttemptId(requestId);
      expect(attemptId).toBeTruthy();
      await drainDraftGeneration(workflow, requestId);
      const instanceId = `${requestId}:${attemptId}`;
      expect(workflow.retainedInstanceIds()).toContain(instanceId);
      await expect(
        workflow.start({
          requestId,
          practitionerId: practitioner,
          attemptId: attemptId!,
        }),
      ).rejects.toThrow("(instance.already_exists)");
    } finally {
      storage.close();
    }
  });
});

describe("DIDI-1289 off-request-path draft generation (DeepInfra providers, fetch stubbed)", () => {
  function deepInfraTestBundle(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    practitioner: string,
    stopAfterStep?: "text" | "start_image",
  ) {
    const draftGenerator = createDeepInfraExerciseDraftGenerator({
      apiKey: "test-key",
    });
    const images = new DeepInfraFluxKleinImageGeneration({ apiKey: "test-key" });
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: practitioner,
        email: "deep@ex.com",
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
      exerciseMediaImages: images,
      extraRouteHandlers: [handleExerciseMediaRequest],
    };
    const mediaService = new ExerciseMediaService(
      base.sql,
      images,
      new PrefixMediaStorage(base.objects),
    );
    const requestService = new ExerciseRequestsService(base.sql, base.config, {
      draftGenerator,
      initialDraftMediaProgress: (versionId) =>
        mediaService.getInitialDraftMediaProgress(versionId),
    });
    const { deps, workflow } = attachDraftGenerationTestWorkflow(
      base,
      (requestId) => requestService.loadDraftView(requestId),
      stopAfterStep ? { stopAfterStep } : undefined,
    );
    return {
      deps,
      cookie: auth.createSessionCookieHeader(),
      workflow,
      requestService,
      mediaService,
    };
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

  it("cancel after text: resume skips DeepInfra text chat (fetch counts)", async () => {
    const stub = installDidi1289DeepInfraFetchStub();
    try {
      const storage = await openMigratedDatabase();
      try {
        const practitioner = await seedPractitioner(
          storage,
          id("pr-1289-di-text"),
          "deep-text@ex.com",
        );
        const { deps, cookie, workflow } = deepInfraTestBundle(
          storage,
          practitioner,
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
        expect(stub.counts.textChat).toBe(1);
        expect(stub.counts.startImageGeneration).toBe(0);
        const afterText = { ...stub.counts };
        const staleBefore = new Date(
          Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 1_000,
        ).toISOString();
        await storage.run(
          "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
          [staleBefore, requestId],
        );
        const draftGenerator = createDeepInfraExerciseDraftGenerator({
          apiKey: "test-key",
        });
        const resumeRequestService = new ExerciseRequestsService(
          deps.sql,
          deps.config,
          {
            draftGenerator,
            initialDraftMediaProgress: (versionId) =>
              new ExerciseMediaService(
                deps.sql,
                deps.exerciseMediaImages!,
                new PrefixMediaStorage(deps.objects),
              ).getInitialDraftMediaProgress(versionId),
          },
        );
        const { workflow: resumeWorkflow } = attachDraftGenerationTestWorkflow(
          deps,
          (rid) => resumeRequestService.loadDraftView(rid),
        );
        await handleRequest(
          authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
            method: "POST",
            body: JSON.stringify({}),
          }),
          { ...deps, draftGenerationWorkflow: resumeWorkflow },
        );
        await drainDraftGeneration(resumeWorkflow, requestId);
        expect(stub.counts.textChat - afterText.textChat).toBe(0);
        expect(stub.counts.startImageGeneration - afterText.startImageGeneration).toBe(
          1,
        );
        expect(stub.counts.endImageEdit - afterText.endImageEdit).toBe(1);
      } finally {
        storage.close();
      }
    } finally {
      stub.restore();
    }
  });

  it("cancel after start image: resume skips text and start-image DeepInfra fetch", async () => {
    const stub = installDidi1289DeepInfraFetchStub();
    try {
      const storage = await openMigratedDatabase();
      try {
        const practitioner = await seedPractitioner(
          storage,
          id("pr-1289-di-start"),
          "deep-start@ex.com",
        );
        const { deps, cookie, workflow } = deepInfraTestBundle(
          storage,
          practitioner,
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
        expect(stub.counts.textChat).toBe(1);
        expect(stub.counts.startImageGeneration).toBe(1);
        expect(stub.counts.endImageEdit).toBe(0);
        const afterStart = { ...stub.counts };
        const staleBefore = new Date(
          Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 1_000,
        ).toISOString();
        await storage.run(
          "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
          [staleBefore, requestId],
        );
        const draftGenerator = createDeepInfraExerciseDraftGenerator({
          apiKey: "test-key",
        });
        const resumeRequestService = new ExerciseRequestsService(
          deps.sql,
          deps.config,
          {
            draftGenerator,
            initialDraftMediaProgress: (versionId) =>
              new ExerciseMediaService(
                deps.sql,
                deps.exerciseMediaImages!,
                new PrefixMediaStorage(deps.objects),
              ).getInitialDraftMediaProgress(versionId),
          },
        );
        const { workflow: resumeWorkflow } = attachDraftGenerationTestWorkflow(
          deps,
          (rid) => resumeRequestService.loadDraftView(rid),
        );
        await handleRequest(
          authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
            method: "POST",
            body: JSON.stringify({}),
          }),
          { ...deps, draftGenerationWorkflow: resumeWorkflow },
        );
        await drainDraftGeneration(resumeWorkflow, requestId);
        expect(stub.counts.textChat - afterStart.textChat).toBe(0);
        expect(stub.counts.startImageGeneration - afterStart.startImageGeneration).toBe(
          0,
        );
        expect(stub.counts.endImageEdit - afterStart.endImageEdit).toBe(1);
      } finally {
        storage.close();
      }
    } finally {
      stub.restore();
    }
  });

  it("first /generate is not charged toward daily media quota; canceled run leaves quota unchanged", async () => {
    const stub = installDidi1289DeepInfraFetchStub();
    try {
      const storage = await openMigratedDatabase();
      try {
        const practitioner = await seedPractitioner(
          storage,
          id("pr-1289-di-quota"),
          "deep-quota@ex.com",
        );
        const capExerciseId = await seedExercise(storage, practitioner);
        for (let i = 0; i < 5; i += 1) {
          await storage.run(
            `INSERT INTO media_regenerations (
            id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              id(`regen-1289-di-${i}`),
              practitioner,
              capExerciseId,
              null,
              "both",
              0,
              FORM_OPENED,
            ],
          );
        }
        const { deps, cookie, workflow } = deepInfraTestBundle(
          storage,
          practitioner,
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
    } finally {
      stub.restore();
    }
  });

  it("resume after partial run does not charge media quota twice", async () => {
    const stub = installDidi1289DeepInfraFetchStub();
    try {
      const storage = await openMigratedDatabase();
      try {
        const practitioner = await seedPractitioner(
          storage,
          id("pr-1289-di-quota-resume"),
          "deep-qr@ex.com",
        );
        const { deps, cookie, workflow } = deepInfraTestBundle(
          storage,
          practitioner,
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
        const draftGenerator = createDeepInfraExerciseDraftGenerator({
          apiKey: "test-key",
        });
        const resumeRequestService = new ExerciseRequestsService(
          deps.sql,
          deps.config,
          {
            draftGenerator,
            initialDraftMediaProgress: (versionId) =>
              new ExerciseMediaService(
                deps.sql,
                deps.exerciseMediaImages!,
                new PrefixMediaStorage(deps.objects),
              ).getInitialDraftMediaProgress(versionId),
          },
        );
        const { workflow: resumeWorkflow } = attachDraftGenerationTestWorkflow(
          deps,
          (rid) => resumeRequestService.loadDraftView(rid),
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
    } finally {
      stub.restore();
    }
  });
});
