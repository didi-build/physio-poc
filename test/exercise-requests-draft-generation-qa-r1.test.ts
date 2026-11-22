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
  exerciseRequestPath,
  exerciseRequestRegenerateTextPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
} from "./helpers/draft-generation-test-workflow.js";
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
import { ImageGenerationError } from "../src/storage/ports/image-generation.js";
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

/** Initial draft generation uses separate start/end calls, not generateStartAndEndImages. */
class FailingInitialDraftImageGeneration extends FailingFakeImageGeneration {
  override async generateStartImage(): Promise<
    import("../src/storage/ports/image-generation.js").GeneratedImage
  > {
    throw new ImageGenerationError("image_generation_request_failed", 502);
  }
}

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
  const objects = new InMemoryObjectStorage();
  const baseDeps = {
    sql: storage,
    objects,
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
    objects,
  };
}

async function createOpenRequest(
  storage: SqlStoragePort,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator = fakeExerciseDraftGenerator,
  exerciseMediaImages?: FailingFakeImageGeneration,
) {
  const {
    deps: bundle,
    cookie,
    workflow,
    objects,
  } = deps(storage, practitionerId, email, exerciseDraftGenerator, exerciseMediaImages);
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
  return { requestId: body.request_id, cookie, bundle, workflow, objects };
}

describe("Exercise request draft generation QA R1 (B8 HTTP)", () => {
  it("B8 racing POST /generate: two 202 in_progress, one started_elsewhere, single generator run", async () => {
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
      const { requestId, cookie, bundle, workflow } = await createOpenRequest(
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
      expect(statuses).toEqual([202, 202]);
      const responses = [
        { status: first.status, body: await first.json() },
        { status: second.status, body: await second.json() },
      ];
      await drainDraftGeneration(workflow, requestId);
      expect(generatorCalls).toBe(1);
      const startedHere = responses.find((r) => r.body.started_elsewhere === false);
      const startedElsewhere = responses.find((r) => r.body.started_elsewhere === true);
      expect(startedHere?.body).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
        view: expect.objectContaining({ request_id: requestId }),
      });
      expect(startedElsewhere?.body).toEqual({
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
      const { requestId, cookie, bundle, workflow, objects } = await createOpenRequest(
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
      expect(response.status).toBe(202);
      await expect(response.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
        view: expect.objectContaining({ request_id: requestId }),
      });
      await drainDraftGeneration(workflow, requestId);
      const requestService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
      });
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(objects),
      );
      await expect(
        requestService.generateRequest({
          practitionerId: practitioner,
          requestId,
          mediaService,
        }),
      ).resolves.toEqual({
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
      const failImages = new FailingInitialDraftImageGeneration(true);
      const { requestId, cookie, bundle, workflow, objects } = await createOpenRequest(
        storage,
        practitioner,
        "imgfail@example.com",
        fakeExerciseDraftGenerator,
        failImages,
      );
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
        view: expect.objectContaining({ request_id: requestId }),
      });
      await drainDraftGeneration(workflow, requestId);
      const requestService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const mediaService = new ExerciseMediaService(
        storage,
        failImages,
        new PrefixMediaStorage(objects),
      );
      await expect(
        requestService.generateRequest({
          practitionerId: practitioner,
          requestId,
          mediaService,
        }),
      ).resolves.toEqual({
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
      const { requestId, cookie, bundle, workflow } = await createOpenRequest(
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
      expect(completeGenerate.status).toBe(202);
      await expect(completeGenerate.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      await drainDraftGeneration(workflow, requestId);
      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const ready = (await viewResponse.json()) as {
        generation: { first_draft_complete: boolean };
      };
      expect(ready.generation.first_draft_complete).toBe(true);

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
      const { requestId, cookie, bundle, workflow } = await createOpenRequest(
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
      expect(generated.status).toBe(202);
      await expect(generated.json()).resolves.toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      await drainDraftGeneration(workflow, requestId);
      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const { draft } = (await viewResponse.json()) as {
        draft: { exercise_version_id: string } | null;
      };
      const view = { draft };
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
      const { requestId, cookie, bundle, workflow } = await createOpenRequest(
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
      expect(generated.status).toBe(202);
      await drainDraftGeneration(workflow, requestId);
      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const { draft } = (await viewResponse.json()) as {
        draft: { exercise_version_id: string } | null;
      };
      const view = { draft };
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
      const {
        deps: bundle,
        cookie,
        workflow,
      } = deps(tracking, practitioner, "batch@example.com");
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "QA batch guard",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      expect(created.status).toBe(200);
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
