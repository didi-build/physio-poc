import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import { exerciseRequestGeneratePath } from "../src/exercise-requests-api-paths.js";
import { DRAFT_GENERATION_FAILED_EVENT } from "../src/services/exercise-requests/draft-generation-failure-log.js";
import {
  fakeExerciseDraftGenerator,
  type ExerciseDraftGenerator,
} from "../src/services/exercise-requests/fake-draft-generator.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { FailingFakeImageGeneration } from "./helpers/failing-fake-image-generation.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { exerciseRequestsCollectionPath } from "../src/exercise-requests-api-paths.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

class ThrowingPutObjectStorage extends InMemoryObjectStorage {
  override async put(): Promise<void> {
    throw new Error("r2_put_failed");
  }
}

describe("DIDI-1276 generate unexpected orchestration errors", () => {
  it("returns 502 images_failed, logs, and releases lock when R2 put throws", async () => {
    const storage = await openMigratedDatabase();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-r2-fail"),
        "r2@example.com",
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "r2@example.com",
          displayName: "Coach",
        },
      });
      const bundle = {
        sql: storage,
        objects: new ThrowingPutObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const cookie = auth.createSessionCookieHeader();
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "R2 fail move",
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
        {
          ...bundle,
          objects: new ThrowingPutObjectStorage(),
          exerciseMediaImages: new FakeImageGeneration(),
        },
      );
      expect(response.status).toBe(502);
      const body = (await response.json()) as {
        outcome: string;
        view: { draft: unknown };
      };
      expect(body.outcome).toBe("images_failed");
      expect(body.view.draft).toBeTruthy();

      const lock = await storage.first<{ draft_generation_locked_at: string | null }>(
        "SELECT draft_generation_locked_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(lock?.draft_generation_locked_at).toBeNull();

      const logLine = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((line) => line.includes(DRAFT_GENERATION_FAILED_EVENT));
      expect(logLine).toBeTruthy();
      const parsed = JSON.parse(logLine!) as { event: string; phase: string };
      expect(parsed.event).toBe(DRAFT_GENERATION_FAILED_EVENT);
      expect(parsed.phase).toBe("images");
    } finally {
      logSpy.mockRestore();
      storage.close();
    }
  });

  it("returns 502 text_failed when text generator throws a non-domain error", async () => {
    const storage = await openMigratedDatabase();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-text-unexpected"),
        "txt@example.com",
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "txt@example.com",
          displayName: "Coach",
        },
      });
      const throwingGenerator: ExerciseDraftGenerator = async () => {
        throw new Error("unexpected_text_phase");
      };
      const bundle = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: throwingGenerator,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const cookie = auth.createSessionCookieHeader();
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Text unexpected",
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
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        outcome: "text_failed",
      });
      const lock = await storage.first<{ draft_generation_locked_at: string | null }>(
        "SELECT draft_generation_locked_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(lock?.draft_generation_locked_at).toBeNull();
      const logLine = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((line) => line.includes(DRAFT_GENERATION_FAILED_EVENT));
      expect(logLine).toBeTruthy();
      const parsed = JSON.parse(logLine!) as { event: string; phase: string };
      expect(parsed.event).toBe("physio_draft_generation_failed");
      expect(parsed.phase).toBe("text");
    } finally {
      logSpy.mockRestore();
      storage.close();
    }
  });

  it("returns 502 images_failed, logs, and releases lock when D1 persist throws after images", async () => {
    const storage = await openMigratedDatabase();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    let failMediaPersist = false;
    const originalRun = storage.run.bind(storage);
    const runSpy = vi.spyOn(storage, "run").mockImplementation(async (sql, params) => {
      if (
        failMediaPersist &&
        typeof sql === "string" &&
        sql.includes("INSERT INTO exercise_media_sets")
      ) {
        throw new Error("d1_persist_failed");
      }
      return originalRun(sql, params);
    });
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-d1-batch"),
        "d1@example.com",
      );
      const requestId = id("req-d1-batch");
      const exerciseId = await seedExercise(storage, practitioner, id("ex-d1-batch"));
      const versionId = id("ver-d1-batch");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          title: "Row",
          description: "Has text",
          starting_position: "Stand",
          steps: "Step",
        }),
      );
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: practitioner,
        requestedName: "Row",
      });
      await storage.run("UPDATE exercise_requests SET exercise_id = ? WHERE id = ?", [
        exerciseId,
        requestId,
      ]);

      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "d1@example.com",
          displayName: "Coach",
        },
      });
      const bundle = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const cookie = auth.createSessionCookieHeader();
      failMediaPersist = true;
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(runSpy).toHaveBeenCalled();
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        outcome: "images_failed",
      });
      const lock = await storage.first<{ draft_generation_locked_at: string | null }>(
        "SELECT draft_generation_locked_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(lock?.draft_generation_locked_at).toBeNull();
      expect(
        logSpy.mock.calls.some((c) =>
          String(c[0]).includes(DRAFT_GENERATION_FAILED_EVENT),
        ),
      ).toBe(true);
    } finally {
      runSpy.mockRestore();
      logSpy.mockRestore();
      storage.close();
    }
  });

  it("returns 502 images_failed when image generation fails after text exists", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-img-fail2"),
        "img2@example.com",
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "img2@example.com",
          displayName: "Coach",
        },
      });
      const bundle = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        exerciseMediaImages: new FailingFakeImageGeneration(true),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const cookie = auth.createSessionCookieHeader();
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Image fail",
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
      expect(response.status).toBe(502);
      const body = (await response.json()) as { outcome: string };
      expect(body.outcome).toBe("images_failed");
    } finally {
      storage.close();
    }
  });
});
