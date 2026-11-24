import { describe, expect, it, vi } from "vitest";
import { underDraftGenerationLock } from "../src/services/exercise-requests/exercise-request-generation-lock.js";
import type { ExerciseRequestDraftView } from "../src/services/exercise-requests/types.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import { exerciseMediaDraftStillPath } from "../src/exercise-media-api-paths.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestPath,
  exerciseRequestRegenerateTextPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  createDelayedFakeExerciseDraftGenerator,
  createFakeExerciseDraftGenerator,
  fakeExerciseDraftGenerator,
} from "../src/services/exercise-requests/fake-draft-generator.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedExercise,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  FailingFakeImageGeneration,
  FailingInitialDraftImageGeneration,
} from "./helpers/failing-fake-image-generation.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
} from "./helpers/draft-generation-test-workflow.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

function deps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator = fakeExerciseDraftGenerator,
  exerciseMediaImages?: FailingFakeImageGeneration,
) {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "Coach" },
  });
  const baseDeps = {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    auth,
    mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    exerciseDraftGenerator,
    exerciseMediaImages,
    extraRouteHandlers: [handleExerciseMediaRequest],
  };
  const requestService = new ExerciseRequestsService(baseDeps.sql, baseDeps.config, {
    draftGenerator: exerciseDraftGenerator,
  });
  const { deps: bundle, workflow } = attachDraftGenerationTestWorkflow(
    baseDeps,
    (requestId) => requestService.loadDraftView(requestId),
  );
  return {
    deps: bundle,
    cookie: auth.createSessionCookieHeader(),
    workflow,
    baseDeps,
  };
}

async function createOpenRequest(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator = fakeExerciseDraftGenerator,
  exerciseMediaImages?: FailingFakeImageGeneration,
) {
  const {
    deps: bundle,
    cookie,
    workflow,
    baseDeps,
  } = deps(storage, practitionerId, email, exerciseDraftGenerator, exerciseMediaImages);
  const created = await handleRequest(
    authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
      method: "POST",
      body: JSON.stringify({
        requested_name: "Heel slide draft",
        form_opened_at: FORM_OPENED,
      }),
    }),
    bundle,
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { request_id: string };
  return { requestId: body.request_id, cookie, bundle, workflow, baseDeps };
}

async function submitAndGenerate(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  generator = fakeExerciseDraftGenerator,
  images?: FailingFakeImageGeneration,
) {
  const {
    deps: bundle,
    cookie,
    workflow,
    baseDeps,
  } = deps(storage, practitionerId, email, generator, images);
  const created = await handleRequest(
    authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
      method: "POST",
      body: JSON.stringify({
        requested_name: "Heel slide draft",
        form_opened_at: FORM_OPENED,
      }),
    }),
    bundle,
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { request_id: string };
  const generated = await handleRequest(
    authedJsonRequest(exerciseRequestGeneratePath(body.request_id), cookie, {
      method: "POST",
      body: JSON.stringify({}),
    }),
    bundle,
  );
  await drainDraftGeneration(workflow, body.request_id);
  return {
    generateResponse: generated,
    requestId: body.request_id,
    cookie,
    bundle,
    workflow,
    baseDeps,
  };
}

describe("Exercise request draft generation HTTP (DIDI-1215)", () => {
  it("generates text then images on success", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-ok"),
        "ok@example.com",
      );
      const { generateResponse, requestId, cookie, bundle } = await submitAndGenerate(
        storage,
        practitioner,
        "ok@example.com",
      );
      expect(generateResponse.status).toBe(202);
      const payload = (await generateResponse.json()) as {
        outcome: string;
        started_elsewhere?: boolean;
      };
      expect(payload.outcome).toBe("in_progress");
      expect(payload).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });

      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const view = (await viewResponse.json()) as {
        generation: { first_draft_complete: boolean };
      };
      expect(view.generation.first_draft_complete).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("text failure stores nothing and can be retried", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-text"),
        "text@example.com",
      );
      const generator = createFakeExerciseDraftGenerator({ failText: true });
      const first = await submitAndGenerate(
        storage,
        practitioner,
        "text@example.com",
        generator,
      );
      expect(first.generateResponse.status).toBe(202);
      const row = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [first.requestId],
      );
      expect(row?.exercise_id).toBeNull();

      first.baseDeps.exerciseDraftGenerator = fakeExerciseDraftGenerator;
      first.bundle.exerciseDraftGenerator = fakeExerciseDraftGenerator;
      const retry = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(first.requestId), first.cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        first.bundle,
      );
      expect(retry.status).toBe(202);
      await drainDraftGeneration(first.workflow, first.requestId);
      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(first.requestId)}`, {
          headers: { cookie: first.cookie },
        }),
        first.bundle,
      );
      const view = (await viewResponse.json()) as {
        generation: { first_draft_complete: boolean };
      };
      expect(view.generation.first_draft_complete).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("image failure keeps text and can be retried", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-img"),
        "img@example.com",
      );
      const failImages = new FailingInitialDraftImageGeneration(true);
      const first = await submitAndGenerate(
        storage,
        practitioner,
        "img@example.com",
        fakeExerciseDraftGenerator,
        failImages,
      );
      expect(first.generateResponse.status).toBe(202);
      const row = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [first.requestId],
      );
      expect(row?.exercise_id).not.toBeNull();

      const fixedImages = new FailingFakeImageGeneration(false);
      first.baseDeps.exerciseMediaImages = fixedImages;
      first.bundle.exerciseMediaImages = fixedImages;
      const retry = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(first.requestId), first.cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        first.bundle,
      );
      expect(retry.status).toBe(202);
      await drainDraftGeneration(first.workflow, first.requestId);
      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(first.requestId)}`, {
          headers: { cookie: first.cookie },
        }),
        first.bundle,
      );
      const view = (await viewResponse.json()) as {
        generation: { first_draft_complete: boolean };
      };
      expect(view.generation.first_draft_complete).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("rejects generate from a non-requester", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pr-req-own"),
        "own@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("pr-req-other"),
        "other@example.com",
      );
      const requestId = id("req-own-gen");
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: requester,
        requestedName: "Owned request",
      });
      const otherAuth = new FakeAuthPort({
        practitioner: {
          practitionerId: other,
          email: "other@example.com",
          displayName: "Other",
        },
      });
      const response = await handleRequest(
        authedJsonRequest(
          exerciseRequestGeneratePath(requestId),
          otherAuth.createSessionCookieHeader(),
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        ),
        deps(storage, other, "other@example.com").deps,
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "generation_not_requester",
        message: "Only the requester can run draft generation",
      });
    } finally {
      storage.close();
    }
  });

  it("DIDI-1276 pinned: fresh lock short-circuits before tryAcquire (kills M14)", async () => {
    const now = new Date().toISOString();
    const view = {
      request_id: "req-lock-sc",
      requested_name: "Move",
      exercise_note: null,
      status: "drafting" as const,
      requested_by: "p",
      requested_by_email: "k@example.com",
      exercise_id: null,
      generation: { generation_in_progress: true, first_draft_complete: false },
      draft: null,
    } satisfies ExerciseRequestDraftView;
    const tryAcquire = vi.fn().mockResolvedValue(false);
    const run = vi.fn().mockResolvedValue({ ok: true });
    const requests = {
      getDraftGenerationLockedAt: vi.fn().mockResolvedValue(now),
      tryAcquireDraftGenerationLock: tryAcquire,
      releaseDraftGenerationLock: vi.fn(),
    } as unknown as ExerciseRequestsRepository;
    const result = await underDraftGenerationLock({
      requestId: "req-lock-sc",
      now,
      requests,
      loadView: async () => view,
      run,
    });
    expect(result.kind).toBe("in_progress");
    expect(tryAcquire).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("DIDI-1276 pinned: fresh lock during retry returns 202 in_progress", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-retry-lock"),
        "retry-lock@example.com",
      );
      const delayed = createDelayedFakeExerciseDraftGenerator({ delayMs: 200 });
      const { bundle, cookie, requestId, workflow } = await createOpenRequest(
        storage,
        practitioner,
        "retry-lock@example.com",
        delayed,
      );
      const first = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        bundle,
      );
      expect(first.status).toBe(202);
      const heldAt = new Date().toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [heldAt, requestId],
      );
      const retry = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        bundle,
      );
      expect(retry.status).toBe(202);
      await expect(retry.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: true,
      });
      await drainDraftGeneration(workflow, requestId);
    } finally {
      storage.close();
    }
  });

  it("POST /generate returns 503 draft_generation_workflow_unavailable without a binding", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-no-wf"),
        "no-wf@example.com",
      );
      const { bundle, cookie, requestId } = await createOpenRequest(
        storage,
        practitioner,
        "no-wf@example.com",
      );
      const withoutWorkflow = { ...bundle };
      delete (withoutWorkflow as { draftGenerationWorkflow?: unknown })
        .draftGenerationWorkflow;
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        withoutWorkflow,
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: "draft_generation_workflow_unavailable",
      });
    } finally {
      storage.close();
    }
  });

  it("returns in_progress for a concurrent second generate while the lock is held", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-conc"),
        "conc@example.com",
      );
      const delayed = createDelayedFakeExerciseDraftGenerator({ delayMs: 200 });
      const { bundle, cookie, requestId, workflow } = await createOpenRequest(
        storage,
        practitioner,
        "conc@example.com",
        delayed,
      );
      const first = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        bundle,
      );
      expect(first.status).toBe(202);
      const now = new Date().toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [now, requestId],
      );
      const second = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        bundle,
      );
      expect(second.status).toBe(202);
      const payload = (await second.json()) as {
        outcome: string;
        started_elsewhere?: boolean;
      };
      expect(payload.outcome).toBe("in_progress");
      expect(payload.started_elsewhere).toBe(true);
      expect(payload).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: true,
      });
      await drainDraftGeneration(workflow, requestId);
    } finally {
      storage.close();
    }
  });

  it("first generate does not consume the five-a-day media regen counter at quota", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-quota-skip"),
        "quota-skip@example.com",
      );
      const capExerciseId = await seedExercise(storage, practitioner);
      for (let i = 0; i < 5; i += 1) {
        await storage.run(
          `INSERT INTO media_regenerations (
            id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id(`regen-cap-${i}`),
            practitioner,
            capExerciseId,
            null,
            "both",
            0,
            FORM_OPENED,
          ],
        );
      }
      const {
        cookie,
        deps: bundle,
        workflow,
      } = deps(storage, practitioner, "quota-skip@example.com");
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Quota skip draft",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      const generated = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        bundle,
      );
      expect(generated.status).toBe(202);
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

  it("draft still GET is limited to the exercise owner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pr-still-own"),
        "still-own@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("pr-still-other"),
        "still-other@example.com",
      );
      const { generateResponse, cookie, bundle, requestId } = await submitAndGenerate(
        storage,
        requester,
        "still-own@example.com",
      );
      expect(generateResponse.status).toBe(202);
      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const payload = (await viewResponse.json()) as {
        draft: { exercise_version_id: string } | null;
      };
      const versionId = payload.draft?.exercise_version_id;
      expect(versionId).toBeTruthy();
      const ownStill = await handleRequest(
        new Request(`${BASE}${exerciseMediaDraftStillPath(versionId!, "start")}`, {
          headers: { cookie },
        }),
        bundle,
      );
      expect(ownStill.status).toBe(200);

      const otherAuth = new FakeAuthPort({
        practitioner: {
          practitionerId: other,
          email: "still-other@example.com",
          displayName: "Other",
        },
      });
      const foreignStill = await handleRequest(
        new Request(`${BASE}${exerciseMediaDraftStillPath(versionId!, "start")}`, {
          headers: { cookie: otherAuth.createSessionCookieHeader() },
        }),
        deps(storage, other, "still-other@example.com").deps,
      );
      expect(foreignStill.status).toBe(404);
      const body = (await foreignStill.json()) as { error?: string };
      expect(body.error).toBe("version_not_found");
      expect(body).toEqual({
        error: "version_not_found",
        message: "Exercise version not found",
      });
    } finally {
      storage.close();
    }
  });

  it("releases draft generation lock only when the holder token matches", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requests = new ExerciseRequestsRepository(storage);
      const requestId = id("req-lock-holder");
      const practitioner = await seedPractitioner(
        storage,
        id("pr-lock"),
        "lock@example.com",
      );
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: practitioner,
        requestedName: "Lock holder",
      });
      const heldAt = "2026-11-21T12:00:00.000Z";
      const attemptHeld = id("attempt-held");
      const attemptNewer = id("attempt-newer");
      await requests.tryAcquireDraftGenerationLock({
        requestId,
        lockedAt: heldAt,
        staleBefore: "2026-11-21T11:00:00.000Z",
        attemptId: attemptHeld,
      });
      await requests.releaseDraftGenerationLock(requestId, id("attempt-wrong"));
      expect(await requests.getDraftGenerationLockedAt(requestId)).toBe(heldAt);
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        ["2026-11-21T12:05:00.000Z", attemptNewer, requestId],
      );
      await requests.releaseDraftGenerationLock(requestId, attemptHeld);
      expect(await requests.getDraftGenerationLockedAt(requestId)).not.toBeNull();
      await requests.releaseDraftGenerationLock(requestId, attemptNewer);
      expect(await requests.getDraftGenerationLockedAt(requestId)).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects regenerate-text notes with patient details before the generator runs", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-regen-note"),
        "regen@example.com",
      );
      let generatorCalls = 0;
      const trackingGenerator = async (
        ...args: Parameters<typeof fakeExerciseDraftGenerator>
      ) => {
        generatorCalls += 1;
        return fakeExerciseDraftGenerator(...args);
      };
      const { cookie, bundle, requestId } = await submitAndGenerate(
        storage,
        practitioner,
        "regen@example.com",
        trackingGenerator,
      );
      generatorCalls = 0;
      const bad = await handleRequest(
        authedJsonRequest(exerciseRequestRegenerateTextPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ note: "patient: jane.doe@example.com" }),
        }),
        bundle,
      );
      expect(bad.status).toBe(400);
      expect(generatorCalls).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("returns in_progress for concurrent regenerate-text while generate lock is held", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-regen-conc"),
        "regen-conc@example.com",
      );
      const { cookie, bundle, requestId } = await submitAndGenerate(
        storage,
        practitioner,
        "regen-conc@example.com",
      );
      const now = new Date().toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [now, requestId],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestRegenerateTextPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ note: "emphasize control" }),
        }),
        bundle,
      );
      expect(response.status).toBe(202);
      const payload = (await response.json()) as { outcome: string };
      expect(payload.outcome).toBe("in_progress");
    } finally {
      storage.close();
    }
  });
});
