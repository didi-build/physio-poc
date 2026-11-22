import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import { exerciseMediaDraftStillPath } from "../src/exercise-media-api-paths.js";
import {
  exerciseRequestApprovePath,
  exerciseRequestGeneratePath,
  exerciseRequestRegenerateTextPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
} from "./helpers/draft-generation-test-workflow.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import {
  createFakeExerciseDraftGenerator,
  fakeExerciseDraftGenerator,
} from "../src/services/exercise-requests/fake-draft-generator.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
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

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

const REGEN_TEXT_FAILED_BODY = {
  outcome: "text_failed",
  error: "deepinfra_exercise_draft_response_invalid",
  view: null,
} as const;

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

async function submitAndCompleteGenerate(
  storage: SqlStoragePort,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator = fakeExerciseDraftGenerator,
) {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "Coach" },
  });
  const cookie = auth.createSessionCookieHeader();
  const baseDeps = {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    auth,
    mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    exerciseDraftGenerator,
    extraRouteHandlers: [handleExerciseMediaRequest],
  };
  const requestService = new ExerciseRequestsService(baseDeps.sql, baseDeps.config, {
    draftGenerator: exerciseDraftGenerator,
  });
  const { deps: bundle, workflow } = attachDraftGenerationTestWorkflow(
    baseDeps,
    (requestId) => requestService.loadDraftView(requestId),
  );
  const created = await handleRequest(
    authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
      method: "POST",
      body: JSON.stringify({
        requested_name: "QA R3 draft",
        form_opened_at: FORM_OPENED,
      }),
    }),
    bundle,
  );
  const { request_id: requestId } = (await created.json()) as { request_id: string };
  const generated = await handleRequest(
    authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
      method: "POST",
      body: "{}",
    }),
    bundle,
  );
  expect(generated.status).toBe(202);
  await expect(generated.json()).resolves.toMatchObject({
    outcome: "in_progress",
    started_elsewhere: false,
  });
  await drainDraftGeneration(workflow, requestId);
  return { requestId, cookie, bundle, workflow };
}

describe("Exercise request draft generation QA R3 (HTTP)", () => {
  it("B4 regenerate-text malformed JSON: one retry, typed 502 text_failed, AI call count", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-r3-b4"),
        "r3b4@example.com",
      );
      const { requestId, cookie, bundle } = await submitAndCompleteGenerate(
        storage,
        practitioner,
        "r3b4@example.com",
      );
      const badJson = (content: string) =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(badJson("not json at all"))
        .mockResolvedValueOnce(badJson("{still not json"));
      const generator = createDeepInfraExerciseDraftGenerator({
        apiKey: "super-secret-api-key",
        fetchImpl,
      });
      const responsePromise = handleRequest(
        authedJsonRequest(exerciseRequestRegenerateTextPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ note: "shorter cues" }),
        }),
        { ...bundle, exerciseDraftGenerator: generator },
      ).then(async (response) => {
        const raw = await response.text();
        return {
          status: response.status,
          body: JSON.parse(raw) as typeof REGEN_TEXT_FAILED_BODY,
          raw,
        };
      });
      await expect(responsePromise).resolves.toMatchObject({
        status: 502,
        body: REGEN_TEXT_FAILED_BODY,
      });
      const envelope = await responsePromise;
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(envelope.raw).not.toContain("super-secret-api-key");
    } finally {
      storage.close();
    }
  });

  it("S3/S10 in_progress POST sets generation_in_progress on view", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-r3-s3"),
        "r3s3@example.com",
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "r3s3@example.com",
          displayName: "C",
        },
      });
      const cookie = auth.createSessionCookieHeader();
      const baseDeps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const requestService = new ExerciseRequestsService(
        baseDeps.sql,
        baseDeps.config,
        {
          draftGenerator: fakeExerciseDraftGenerator,
        },
      );
      const { deps: bundle } = attachDraftGenerationTestWorkflow(
        baseDeps,
        (requestId) => requestService.loadDraftView(requestId),
      );
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "In progress flag",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      const now = new Date().toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [now, requestId],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(202);
      const payload = await response.json();
      expect(payload).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: true,
        view: {
          generation: { generation_in_progress: true, first_draft_complete: false },
        },
      });
    } finally {
      storage.close();
    }
  });

  it("S10 regenerate-text in_progress sets generation_in_progress on view", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-r3-s10"),
        "r3s10@example.com",
      );
      const { requestId, cookie, bundle } = await submitAndCompleteGenerate(
        storage,
        practitioner,
        "r3s10@example.com",
      );
      const now = new Date().toISOString();
      await storage.run(
        "UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?",
        [now, requestId],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestRegenerateTextPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ note: null }),
        }),
        bundle,
      );
      expect(response.status).toBe(202);
      const payload = await response.json();
      expect(payload).toMatchObject({
        outcome: "in_progress",
        view: {
          generation: { generation_in_progress: true },
        },
      });
    } finally {
      storage.close();
    }
  });

  it("MS1 draft still GET does not serve approved media", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-r3-ms1"),
        "r3ms1@example.com",
      );
      const { requestId, cookie, bundle } = await submitAndCompleteGenerate(
        storage,
        practitioner,
        "r3ms1@example.com",
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestApprovePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      const viewRow = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(viewRow?.exercise_id).toBeTruthy();
      const exerciseId = viewRow!.exercise_id as string;
      const versionRow = await storage.first<{
        id: string;
        media_set_id: string | null;
      }>(
        "SELECT id, media_set_id FROM exercise_versions WHERE exercise_id = ? ORDER BY version_number DESC LIMIT 1",
        [exerciseId],
      );
      const versionId = versionRow?.id;
      expect(versionId).toBeTruthy();
      expect(versionRow?.media_set_id).toBeTruthy();
      const mediaSetId = versionRow!.media_set_id;
      expect(mediaSetId).toBeTruthy();
      await storage.run("UPDATE exercise_media_sets SET visibility = ? WHERE id = ?", [
        "public",
        mediaSetId,
      ]);
      const draftStill = await handleRequest(
        new Request(`${BASE}${exerciseMediaDraftStillPath(versionId!, "start")}`, {
          headers: { cookie },
        }),
        bundle,
      );
      expect(draftStill.status).toBe(404);
      await expect(draftStill.json()).resolves.toMatchObject({
        error: "media_not_found",
      });
    } finally {
      storage.close();
    }
  });

  it("batch rollback on SqlBatchGuardError leaves exercise and version row counts at zero", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-r3-roll"),
        "r3roll@example.com",
      );
      const tracking: SqlStoragePort = {
        run: (sql, bindings) => storage.run(sql, bindings),
        all: (sql, bindings) => storage.all(sql, bindings),
        first: (sql, bindings) => storage.first(sql, bindings),
        batch: async (statements) => {
          const guarded = statements.map((statement, index) =>
            index === 2 ? { ...statement, minRowsAffected: 999 } : statement,
          );
          return storage.batch(guarded);
        },
      };
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "r3roll@example.com",
          displayName: "C",
        },
      });
      const cookie = auth.createSessionCookieHeader();
      const baseDeps = {
        sql: tracking,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(tracking, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const requestService = new ExerciseRequestsService(
        baseDeps.sql,
        baseDeps.config,
        {
          draftGenerator: fakeExerciseDraftGenerator,
        },
      );
      const { deps: bundle, workflow } = attachDraftGenerationTestWorkflow(
        baseDeps,
        (requestId) => requestService.loadDraftView(requestId),
      );
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Rollback counts",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      await drainDraftGeneration(workflow, requestId);
      const requestRow = await tracking.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(requestRow?.exercise_id).toBeNull();
      const exerciseCount = await tracking.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercises",
      );
      const versionCount = await tracking.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercise_versions",
      );
      expect(exerciseCount?.count).toBe(0);
      expect(versionCount?.count).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("B8 text_failed on first generate leaves exercise_id null and zero exercise rows (M3)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-r3-m3"),
        "r3m3@example.com",
      );
      const failGenerator = createFakeExerciseDraftGenerator({ failText: true });
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "r3m3@example.com",
          displayName: "C",
        },
      });
      const cookie = auth.createSessionCookieHeader();
      const baseDeps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: failGenerator,
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const requestService = new ExerciseRequestsService(
        baseDeps.sql,
        baseDeps.config,
        {
          draftGenerator: failGenerator,
        },
      );
      const { deps: bundle, workflow } = attachDraftGenerationTestWorkflow(
        baseDeps,
        (requestId) => requestService.loadDraftView(requestId),
      );
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Text fail rows",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      await drainDraftGeneration(workflow, requestId);
      const row = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.exercise_id).toBeNull();
      const exerciseCount = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercises",
      );
      expect(exerciseCount?.count).toBe(0);
    } finally {
      storage.close();
    }
  });
});
