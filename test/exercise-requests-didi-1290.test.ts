import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestPath,
  exerciseRequestWithdrawPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import type { AppDependencies } from "../src/http/app.js";
import {
  DRAFT_GENERATION_LOCK_REFRESHED_EVENT,
  DRAFT_GENERATION_RUN_ABANDONED_EVENT,
  DRAFT_GENERATION_RUN_CANCELED_EVENT,
} from "../src/services/exercise-requests/draft-generation-lock-log.js";
import { DRAFT_GENERATION_LOCK_STALE_MS } from "../src/services/exercise-requests/draft-generation-lock.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
} from "./helpers/draft-generation-test-workflow.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import { id } from "./helpers/opaque-test-ids.js";
import { submitRequestWithGeneratedDraft } from "./helpers/exercise-requests-generate-fixture.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const REPO_ROOT = join(import.meta.dirname, "..");

const RUN_CANCELED_EVENT_LITERAL = "physio_draft_generation_run_canceled";
const RUN_ABANDONED_EVENT_LITERAL = "physio_draft_generation_run_abandoned";
const LOCK_AGE_MS_FIELD = "lock_age_ms";
const REQUEST_ID_FIELD = "request_id";
const PINNED_LOG_NOW_ISO = "2026-11-23T15:00:00.000Z";
const PINNED_LOCK_AGE_MS = 185_000;
const PINNED_LOCKED_AT_ISO = new Date(
  Date.parse(PINNED_LOG_NOW_ISO) - PINNED_LOCK_AGE_MS,
).toISOString();

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

type ParsedLog = Record<string, unknown> & {
  event?: string;
  lock_age_ms?: number | null;
  request_id?: string;
  attempt_id?: string;
};

function parseJsonLogs(logSpy: MockInstance<typeof console.log>): ParsedLog[] {
  return logSpy.mock.calls
    .map((call) => call[0])
    .filter((line): line is string => typeof line === "string" && line.startsWith("{"))
    .map((line) => JSON.parse(line) as ParsedLog);
}

function expectRunAbandonedLogShape(
  log: ParsedLog,
  requestId: string,
  attemptId: string,
  expectedLockAgeMs: number,
): void {
  expect(log.event).toBe(RUN_ABANDONED_EVENT_LITERAL);
  expect(log.event).toBe(DRAFT_GENERATION_RUN_ABANDONED_EVENT);
  expect(Object.prototype.hasOwnProperty.call(log, LOCK_AGE_MS_FIELD)).toBe(true);
  expect(typeof log.lock_age_ms).toBe("number");
  expect(log.lock_age_ms).toBe(expectedLockAgeMs);
  expect(Object.prototype.hasOwnProperty.call(log, REQUEST_ID_FIELD)).toBe(true);
  expect(log.request_id).toBe(requestId);
  expect(log.attempt_id).toBe(attemptId);
}

function expectRunCanceledLogShape(
  log: ParsedLog,
  requestId: string,
  attemptId: string,
  expectedLockAgeMs: number,
): void {
  expect(log.event).toBe(RUN_CANCELED_EVENT_LITERAL);
  expect(log.event).toBe(DRAFT_GENERATION_RUN_CANCELED_EVENT);
  expect(Object.prototype.hasOwnProperty.call(log, LOCK_AGE_MS_FIELD)).toBe(true);
  expect(typeof log.lock_age_ms).toBe("number");
  expect(log.lock_age_ms).toBe(expectedLockAgeMs);
  expect(Object.prototype.hasOwnProperty.call(log, REQUEST_ID_FIELD)).toBe(true);
  expect(log.request_id).toBe(requestId);
  expect(log.attempt_id).toBe(attemptId);
}

function testDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitioner: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practitioner,
      email: "1290@ex.com",
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
  const { deps, workflow } = attachDraftGenerationTestWorkflow(base, (requestId) =>
    new ExerciseRequestsService(base.sql, base.config, {
      draftGenerator: fakeExerciseDraftGenerator,
    }).loadDraftView(requestId),
  );
  return { deps, cookie: auth.createSessionCookieHeader(), workflow };
}

async function createDraftingRequest(
  cookie: string,
  deps: AppDependencies,
): Promise<string> {
  const created = await handleRequest(
    authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
      method: "POST",
      body: JSON.stringify({
        requested_name: "1290 test",
        form_opened_at: FORM_OPENED,
      }),
    }),
    deps,
  );
  const body = (await created.json()) as { request_id: string };
  return body.request_id;
}

describe("DIDI-1290 draft generation follow-ups", () => {
  let logSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("does not ship in-process workflow under src/", () => {
    const srcPath = join(
      REPO_ROOT,
      "src/services/exercise-requests/in-process-draft-generation-workflow.ts",
    );
    expect(existsSync(srcPath)).toBe(false);
  });

  it("delete on a fresh generation lock returns 409 and logs no run_canceled", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-live-delete"),
        "live-del@ex.com",
      );
      const { deps, cookie } = testDeps(storage, practitioner);
      const requestId = await createDraftingRequest(cookie, deps);
      const attemptId = id("att-live-delete");
      const freshLockedAt = new Date().toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [freshLockedAt, attemptId, requestId],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "draft_generation_in_progress",
      });
      const canceled = parseJsonLogs(logSpy).filter(
        (row) => row.event === RUN_CANCELED_EVENT_LITERAL,
      );
      expect(canceled).toHaveLength(0);
    } finally {
      storage.close();
    }
  });

  it("pins run_abandoned and run_canceled log field names and lock_age_ms", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(PINNED_LOG_NOW_ISO));
    const storage = await openMigratedDatabase();
    let requestId: string | undefined;
    let workflow:
      ReturnType<typeof attachDraftGenerationTestWorkflow>["workflow"] | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-log-fields"),
        "logs@ex.com",
      );
      const bundle = testDeps(storage, practitioner);
      workflow = bundle.workflow;
      const { deps, cookie } = bundle;
      requestId = await createDraftingRequest(cookie, deps);
      const staleAttempt = id("att-abandon-shape");
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [PINNED_LOCKED_AT_ISO, staleAttempt, requestId],
      );
      await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const abandoned = parseJsonLogs(logSpy).filter(
        (row) => row.event === RUN_ABANDONED_EVENT_LITERAL,
      );
      expect(abandoned).toHaveLength(1);
      expectRunAbandonedLogShape(
        abandoned[0]!,
        requestId,
        staleAttempt,
        PINNED_LOCK_AGE_MS,
      );

      logSpy.mockClear();
      const cancelAttempt = staleAttempt;
      const withdraw = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(withdraw.status).toBe(200);
      const canceled = parseJsonLogs(logSpy).filter(
        (row) => row.event === RUN_CANCELED_EVENT_LITERAL,
      );
      expect(canceled).toHaveLength(1);
      expectRunCanceledLogShape(
        canceled[0]!,
        requestId,
        cancelAttempt,
        PINNED_LOCK_AGE_MS,
      );
    } finally {
      if (workflow && requestId) {
        await drainDraftGeneration(workflow, requestId).catch(() => undefined);
      }
      vi.useRealTimers();
      storage.close();
    }
  });

  it("two distinct stale attempts emit two run_abandoned lines (D02)", async () => {
    const storage = await openMigratedDatabase();
    let requestId: string | undefined;
    let workflow:
      ReturnType<typeof attachDraftGenerationTestWorkflow>["workflow"] | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-two-abandon"),
        "two-ab@ex.com",
      );
      const bundle = testDeps(storage, practitioner);
      workflow = bundle.workflow;
      const { deps, cookie } = bundle;
      requestId = await createDraftingRequest(cookie, deps);
      const firstAttempt = id("att-stale-1");
      const firstStale = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 5_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [firstStale, firstAttempt, requestId],
      );
      await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      await drainDraftGeneration(workflow, requestId);
      const acquiredAfterFirst = await new ExerciseRequestsRepository(
        deps.sql,
      ).getDraftGenerationAttemptId(requestId);
      expect(acquiredAfterFirst).not.toBe(firstAttempt);
      const secondAttempt = id("att-stale-2");
      const secondStale = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 5_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?, draft_generation_attempt_id = ?
         WHERE id = ?`,
        [secondStale, secondAttempt, requestId],
      );
      await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const abandoned = parseJsonLogs(logSpy).filter(
        (row) => row.event === RUN_ABANDONED_EVENT_LITERAL,
      );
      expect(abandoned).toHaveLength(2);
      expect(abandoned.map((row) => row.attempt_id)).toEqual([
        firstAttempt,
        secondAttempt,
      ]);
      expect(acquiredAfterFirst).not.toBe(secondAttempt);
    } finally {
      if (workflow && requestId) {
        await drainDraftGeneration(workflow, requestId).catch(() => undefined);
      }
      storage.close();
    }
  });

  it("run_abandoned references only the stale attempt id, not the acquiring attempt (D02)", async () => {
    const storage = await openMigratedDatabase();
    let requestId: string | undefined;
    let workflow:
      ReturnType<typeof attachDraftGenerationTestWorkflow>["workflow"] | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-d02-attempt"),
        "d02@ex.com",
      );
      const bundle = testDeps(storage, practitioner);
      workflow = bundle.workflow;
      const { deps, cookie } = bundle;
      const repo = new ExerciseRequestsRepository(deps.sql);
      requestId = await createDraftingRequest(cookie, deps);
      const staleAttempt = id("att-d02-stale-only");
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
      const acquiredAttempt = await repo.getDraftGenerationAttemptId(requestId);
      expect(acquiredAttempt).toBeTruthy();
      expect(acquiredAttempt).not.toBe(staleAttempt);
      const abandoned = parseJsonLogs(logSpy).filter(
        (row) => row.event === RUN_ABANDONED_EVENT_LITERAL,
      );
      expect(abandoned).toHaveLength(1);
      expect(abandoned[0]?.attempt_id).toBe(staleAttempt);
      expect(abandoned[0]?.attempt_id).not.toBe(acquiredAttempt);
    } finally {
      if (workflow && requestId) {
        await drainDraftGeneration(workflow, requestId).catch(() => undefined);
      }
      storage.close();
    }
  });

  it("markDraftGenerationAbandonLoggedIfUnlogged only marks the live attempt (D02 repository)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-d02-repo"),
        "d02repo@ex.com",
      );
      const { deps, cookie } = testDeps(storage, practitioner);
      const repo = new ExerciseRequestsRepository(storage);
      const requestId = await createDraftingRequest(cookie, deps);
      const attemptA = id("att-d02-repo-a");
      const attemptB = id("att-d02-repo-b");
      const lockedAt = new Date().toISOString();
      const loggedAtB = new Date(Date.now() + 5_000).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?,
             draft_generation_attempt_id = ?,
             draft_generation_abandon_logged_at = NULL
         WHERE id = ?`,
        [lockedAt, attemptB, requestId],
      );
      expect(
        await repo.markDraftGenerationAbandonLoggedIfUnlogged({
          requestId,
          attemptId: attemptA,
          loggedAt: lockedAt,
        }),
      ).toBe(false);
      const afterWrongAttempt = await storage.first<{
        draft_generation_abandon_logged_at: string | null;
      }>(
        `SELECT draft_generation_abandon_logged_at FROM exercise_requests WHERE id = ?`,
        [requestId],
      );
      expect(afterWrongAttempt?.draft_generation_abandon_logged_at).toBeNull();
      expect(
        await repo.markDraftGenerationAbandonLoggedIfUnlogged({
          requestId,
          attemptId: attemptB,
          loggedAt: loggedAtB,
        }),
      ).toBe(true);
      const afterRightAttempt = await storage.first<{
        draft_generation_abandon_logged_at: string | null;
      }>(
        `SELECT draft_generation_abandon_logged_at FROM exercise_requests WHERE id = ?`,
        [requestId],
      );
      expect(afterRightAttempt?.draft_generation_abandon_logged_at).toBe(loggedAtB);
    } finally {
      storage.close();
    }
  });

  it("tryAcquire on stale retry clears draft_generation_abandon_logged_at (D03)", async () => {
    const storage = await openMigratedDatabase();
    let requestId: string | undefined;
    let workflow:
      ReturnType<typeof attachDraftGenerationTestWorkflow>["workflow"] | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-dedupe-reset"),
        "dedupe@ex.com",
      );
      const bundle = testDeps(storage, practitioner);
      workflow = bundle.workflow;
      const { deps, cookie } = bundle;
      requestId = await createDraftingRequest(cookie, deps);
      const priorAttempt = id("att-dedupe-prior");
      const staleLockedAt = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 5_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests
         SET draft_generation_locked_at = ?,
             draft_generation_attempt_id = ?,
             draft_generation_abandon_logged_at = NULL
         WHERE id = ?`,
        [staleLockedAt, priorAttempt, requestId],
      );
      await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      const abandonedAfterGet = parseJsonLogs(logSpy).filter(
        (row) => row.event === RUN_ABANDONED_EVENT_LITERAL,
      );
      expect(abandonedAfterGet).toHaveLength(1);
      expect(abandonedAfterGet[0]?.attempt_id).toBe(priorAttempt);
      await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      const row = await storage.first<{
        draft_generation_abandon_logged_at: string | null;
        draft_generation_attempt_id: string | null;
      }>(
        `SELECT draft_generation_abandon_logged_at, draft_generation_attempt_id
         FROM exercise_requests WHERE id = ?`,
        [requestId],
      );
      expect(row?.draft_generation_attempt_id).not.toBe(priorAttempt);
      expect(row?.draft_generation_abandon_logged_at).toBeNull();
    } finally {
      if (workflow && requestId) {
        await drainDraftGeneration(workflow, requestId).catch(() => undefined);
      }
      storage.close();
    }
  });

  it("Regenerate text does not retry HTTP 401 (Q03)", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: "regen-401-key",
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-regen-401"),
        "r401@ex.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const created = await submitRequestWithGeneratedDraft(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Regen401",
          exerciseNote: null,
          formOpenedAt: FORM_OPENED,
        },
        { draftGenerator: fakeExerciseDraftGenerator },
      );
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created");
      }
      const regenService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
      });
      const result = await regenService.regenerateDraftText({
        practitionerId: practitioner,
        requestId: created.request_id,
        note: "retry",
      });
      expect(result).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });

  it("Regenerate text retries HTTP 429 once (2 fetches) (Q05)", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 429 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: "regen-429-key",
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-regen-429"),
        "r429@ex.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const created = await submitRequestWithGeneratedDraft(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Regen429",
          exerciseNote: null,
          formOpenedAt: FORM_OPENED,
        },
        { draftGenerator: fakeExerciseDraftGenerator },
      );
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created");
      }
      const regenService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
      });
      const result = await regenService.regenerateDraftText({
        practitionerId: practitioner,
        requestId: created.request_id,
        note: "retry",
      });
      expect(result).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      storage.close();
    }
  });

  it("Regenerate returns in_progress when lock refresh is superseded after first 503 (H02)", async () => {
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: "regen-h02-key",
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    let refreshSpy: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-regen-h02"),
        "rh02@ex.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const created = await submitRequestWithGeneratedDraft(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "RegenH02",
          exerciseNote: null,
          formOpenedAt: FORM_OPENED,
        },
        { draftGenerator: fakeExerciseDraftGenerator },
      );
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created");
      }
      refreshSpy = vi
        .spyOn(ExerciseRequestsRepository.prototype, "refreshDraftGenerationLock")
        .mockResolvedValueOnce(false);
      const regenService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
      });
      const result = await regenService.regenerateDraftText({
        practitionerId: practitioner,
        requestId: created.request_id,
        note: "h02",
      });
      expect(result).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: true,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    } finally {
      refreshSpy?.mockRestore();
      storage.close();
    }
  });

  it("Regenerate text heartbeats the lock between provider attempts with exact timestamps (H03)", async () => {
    const lockHeldAt = "2026-11-23T12:00:00.000Z";
    const afterFirst503 = "2026-11-23T12:01:00.000Z";
    let nowCall = 0;
    const nowSequence = [lockHeldAt, afterFirst503, afterFirst503];
    const now = () => nowSequence[Math.min(nowCall++, nowSequence.length - 1)]!;
    const expectedRefreshAgeMs = Date.parse(afterFirst503) - Date.parse(lockHeldAt);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: "regen-heartbeat-key",
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-1290-regen-hb"),
        "rhb@ex.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const created = await submitRequestWithGeneratedDraft(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "RegenHeartbeat",
          exerciseNote: null,
          formOpenedAt: FORM_OPENED,
        },
        { draftGenerator: fakeExerciseDraftGenerator },
      );
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created");
      }
      logSpy.mockClear();
      nowCall = 0;
      const refreshSpy = vi.spyOn(
        ExerciseRequestsRepository.prototype,
        "refreshDraftGenerationLock",
      );
      const regenService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
        now,
      });
      await regenService.regenerateDraftText({
        practitionerId: practitioner,
        requestId: created.request_id,
        note: "heartbeat",
      });
      expect(refreshSpy).toHaveBeenCalledWith(
        expect.objectContaining({ lockedAt: afterFirst503 }),
      );
      const refreshed = parseJsonLogs(logSpy).filter(
        (row) => row.event === DRAFT_GENERATION_LOCK_REFRESHED_EVENT,
      );
      expect(refreshed).toHaveLength(1);
      expect(refreshed[0]).toMatchObject({
        event: "physio_draft_generation_lock_refreshed",
      });
      expect(refreshed[0]?.lock_age_ms).toBe(expectedRefreshAgeMs);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      refreshSpy.mockRestore();
    } finally {
      storage.close();
    }
  });
});
