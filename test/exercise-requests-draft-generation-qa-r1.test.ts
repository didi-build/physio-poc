import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import {
  exerciseMediaDraftStillPath,
  exerciseMediaServePath,
} from "../src/exercise-media-api-paths.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestRegenerateTextPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import {
  createDelayedFakeExerciseDraftGenerator,
  createFakeExerciseDraftGenerator,
  fakeExerciseDraftGenerator,
} from "../src/services/exercise-requests/fake-draft-generator.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { FailingFakeImageGeneration } from "./helpers/failing-fake-image-generation.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

const VERSION_NOT_FOUND_BODY = {
  error: "version_not_found",
  message: "Exercise version not found",
} as const;

const GENERATION_NOT_REQUESTER_BODY = {
  error: "generation_not_requester",
  message: "Only the requester can run draft generation",
} as const;

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

function deps(
  storage: SqlStoragePort,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator = fakeExerciseDraftGenerator,
  exerciseMediaImages?: FailingFakeImageGeneration,
) {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "Coach" },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      exerciseDraftGenerator,
      exerciseMediaImages,
      extraRouteHandlers: [handleExerciseMediaRequest],
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function createOpenRequest(
  storage: SqlStoragePort,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator = fakeExerciseDraftGenerator,
) {
  const { deps: bundle, cookie } = deps(
    storage,
    practitionerId,
    email,
    exerciseDraftGenerator,
  );
  const created = await handleRequest(
    authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
      method: "POST",
      body: JSON.stringify({
        requested_name: "QA draft race",
        form_opened_at: FORM_OPENED,
      }),
    }),
    bundle,
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { request_id: string };
  return { requestId: body.request_id, cookie, bundle };
}

describe("Exercise request draft generation QA R1 (B8 HTTP)", () => {
  it("B8 racing POST /generate: one 200 complete, one 202 started_elsewhere, single generator run", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-qa-race"),
        "race@example.com",
      );
      let generatorCalls = 0;
      const delayed = createDelayedFakeExerciseDraftGenerator({ delayMs: 200 });
      const trackingGenerator: typeof fakeExerciseDraftGenerator = async (
        input,
        genDeps,
      ) => {
        generatorCalls += 1;
        return delayed(input, genDeps);
      };
      const { requestId, cookie, bundle } = await createOpenRequest(
        storage,
        practitioner,
        "race@example.com",
        trackingGenerator,
      );
      const path = exerciseRequestGeneratePath(requestId);
      const mk = () =>
        handleRequest(
          authedJsonRequest(path, cookie, { method: "POST", body: "{}" }),
          bundle,
        );
      const [first, second] = await Promise.all([mk(), mk()]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 202]);
      expect(generatorCalls).toBe(1);
      const responses = [
        { status: first.status, body: await first.json() },
        { status: second.status, body: await second.json() },
      ];
      const complete = responses.find((r) => r.status === 200);
      const inProgress = responses.find((r) => r.status === 202);
      expect(complete?.body).toMatchObject({ outcome: "complete" });
      expect(inProgress?.body).toEqual({
        outcome: "in_progress",
        started_elsewhere: true,
        view: expect.objectContaining({ request_id: requestId }),
      });
    } finally {
      storage.close();
    }
  });

  it("B8 pins 403 generation_not_requester body on POST /generate for non-requester", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pr-qa-gen-req"),
        "req@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("pr-qa-gen-other"),
        "other@example.com",
      );
      const requestId = id("req-qa-gen-403");
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: requester,
        requestedName: "403 guard",
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
          { method: "POST", body: "{}" },
        ),
        deps(storage, other, "other@example.com").deps,
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual(GENERATION_NOT_REQUESTER_BODY);
    } finally {
      storage.close();
    }
  });

  it("B8 pins 502 text_failed response body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-qa-text-fail"),
        "textfail@example.com",
      );
      const generator = createFakeExerciseDraftGenerator({ failText: true });
      const { requestId, cookie, bundle } = await createOpenRequest(
        storage,
        practitioner,
        "textfail@example.com",
        generator,
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
        view: null,
      });
    } finally {
      storage.close();
    }
  });

  it("B8 pins 502 images_failed response body (G15 ImageGenerationError)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-qa-img-fail"),
        "imgfail@example.com",
      );
      const failImages = new FailingFakeImageGeneration(true);
      const { requestId, cookie, bundle } = await createOpenRequest(
        storage,
        practitioner,
        "imgfail@example.com",
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        { ...bundle, exerciseMediaImages: failImages },
      );
      expect(response.status).toBe(502);
      const payload = await response.json();
      expect(payload).toEqual({
        outcome: "images_failed",
        view: expect.objectContaining({
          request_id: requestId,
          generation: expect.objectContaining({ first_draft_complete: false }),
        }),
      });
    } finally {
      storage.close();
    }
  });

  it("B8 regenerate-text HTTP: success, 403, invalid_input, and text_failed bodies", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pr-qa-regen"),
        "regen@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("pr-qa-regen-o"),
        "regen-o@example.com",
      );
      const { requestId, cookie, bundle } = await createOpenRequest(
        storage,
        requester,
        "regen@example.com",
      );
      const completeGenerate = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(completeGenerate.status).toBe(200);

      const ok = await handleRequest(
        authedJsonRequest(exerciseRequestRegenerateTextPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ note: "emphasize control" }),
        }),
        bundle,
      );
      expect(ok.status).toBe(200);
      await expect(ok.json()).resolves.toMatchObject({ outcome: "complete" });

      const otherAuth = new FakeAuthPort({
        practitioner: {
          practitionerId: other,
          email: "regen-o@example.com",
          displayName: "Other",
        },
      });
      const forbidden = await handleRequest(
        authedJsonRequest(
          exerciseRequestRegenerateTextPath(requestId),
          otherAuth.createSessionCookieHeader(),
          {
            method: "POST",
            body: JSON.stringify({ note: null }),
          },
        ),
        deps(storage, other, "regen-o@example.com").deps,
      );
      expect(forbidden.status).toBe(403);
      await expect(forbidden.json()).resolves.toEqual(GENERATION_NOT_REQUESTER_BODY);

      const invalid = await handleRequest(
        authedJsonRequest(exerciseRequestRegenerateTextPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ note: "patient: jane.doe@example.com" }),
        }),
        bundle,
      );
      expect(invalid.status).toBe(400);
      const invalidBody = (await invalid.json()) as { error: string; message: string };
      expect(invalidBody.error).toBe("invalid_input");

      const failGenerator = createFakeExerciseDraftGenerator({ failText: true });
      const textFailed = await handleRequest(
        authedJsonRequest(exerciseRequestRegenerateTextPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ note: "shorter steps" }),
        }),
        { ...bundle, exerciseDraftGenerator: failGenerator },
      );
      expect(textFailed.status).toBe(502);
      await expect(textFailed.json()).resolves.toEqual({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
        view: null,
      });
    } finally {
      storage.close();
    }
  });

  it("R6/R7 rejects practitionerId and practitioner_id on POST /generate and /regenerate-text", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-qa-spoof-body"),
        "spoof-body@example.com",
      );
      const foreign = testOpaqueEntityId("qa-spoof-foreign");
      const { requestId, cookie, bundle } = await createOpenRequest(
        storage,
        practitioner,
        "spoof-body@example.com",
      );
      const invalidBody = {
        error: "invalid_input",
        message: "invalid_input",
      };
      const paths = [
        exerciseRequestGeneratePath(requestId),
        exerciseRequestRegenerateTextPath(requestId),
      ] as const;
      for (const path of paths) {
        for (const body of [
          { practitionerId: foreign },
          { practitioner_id: foreign },
        ]) {
          const response = await handleRequest(
            authedJsonRequest(path, cookie, {
              method: "POST",
              body: JSON.stringify(body),
            }),
            bundle,
          );
          expect(response.status).toBe(400);
          await expect(response.json()).resolves.toEqual(invalidBody);
        }
      }
    } finally {
      storage.close();
    }
  });

  it("MR1/MR3 draft still: distinct start/end bytes and Cache-Control no-store", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-qa-still"),
        "still@example.com",
      );
      const { requestId, cookie, bundle } = await createOpenRequest(
        storage,
        practitioner,
        "still@example.com",
      );
      const generated = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(generated.status).toBe(200);
      const { view } = (await generated.json()) as {
        view: { draft: { exercise_version_id: string } | null };
      };
      const versionId = view.draft?.exercise_version_id;
      expect(versionId).toBeTruthy();

      const start = await handleRequest(
        new Request(`${BASE}${exerciseMediaDraftStillPath(versionId!, "start")}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const end = await handleRequest(
        new Request(`${BASE}${exerciseMediaDraftStillPath(versionId!, "end")}`, {
          headers: { cookie },
        }),
        bundle,
      );
      expect(start.status).toBe(200);
      expect(end.status).toBe(200);
      expect(start.headers.get("cache-control")).toBe("no-store");
      expect(end.headers.get("cache-control")).toBe("no-store");
      const startBytes = new Uint8Array(await start.arrayBuffer());
      const endBytes = new Uint8Array(await end.arrayBuffer());
      expect(startBytes).not.toEqual(endBytes);
    } finally {
      storage.close();
    }
  });

  it("MS1/MS2 public media serve on draft version returns version_not_found body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-qa-ms"),
        "ms@example.com",
      );
      const { requestId, cookie, bundle } = await createOpenRequest(
        storage,
        practitioner,
        "ms@example.com",
      );
      const generated = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      const { view } = (await generated.json()) as {
        view: { draft: { exercise_version_id: string } | null };
      };
      expect(view.draft?.exercise_version_id).toBeTruthy();
      const versionId = view.draft!.exercise_version_id;
      const missingId = testOpaqueEntityId("qa-media-missing");

      const missing = await handleRequest(
        new Request(`${BASE}${exerciseMediaServePath(missingId)}?access=public`, {
          headers: { cookie },
        }),
        bundle,
      );
      const draftPublic = await handleRequest(
        new Request(`${BASE}${exerciseMediaServePath(versionId)}?access=public`, {
          headers: { cookie },
        }),
        bundle,
      );
      expect(missing.status).toBe(404);
      expect(draftPublic.status).toBe(404);
      await expect(missing.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
      await expect(draftPublic.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("batch rollback on first-draft SqlBatchGuardError leaves exercise_id null", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-qa-batch"),
        "batch@example.com",
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
      const { requestId, cookie } = await createOpenRequest(
        tracking,
        practitioner,
        "batch@example.com",
      );
      const { deps: bundle } = deps(tracking, practitioner, "batch@example.com");
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(409);
      const row = await tracking.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.exercise_id).toBeNull();
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
});
