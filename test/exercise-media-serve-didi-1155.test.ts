import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { EXERCISE_MEDIA_REGENERATION_QUOTA_PATH } from "../src/exercise-media-api-paths.js";
import {
  exerciseMediaTestDeps,
  exerciseMediaSessionCookie,
} from "./helpers/exercise-media-http.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersionWithMedia,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const CACHE_NO_STORE = "no-store";

const MEDIA_NOT_FOUND_BODY = {
  error: "media_not_found",
  message: "Media not available",
} as const;

describe("exercise media serve DIDI-1155 (Cache-Control and errors)", () => {
  it("pins Cache-Control no-store on media_not_found 404 public serve (N2)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      const versionId = testOpaqueEntityId("didi-1155-approved-no-media");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
          title: "No media yet",
          starting_position: "Supine",
        }),
      ]);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const response = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          headers: { cookie: exerciseMediaSessionCookie(deps) },
        }),
        deps,
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response.json()).resolves.toEqual(MEDIA_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("pins Cache-Control no-store on internal serve 401 without session (N3)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      const versionId = testOpaqueEntityId("didi-1155-internal-401");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          status: "draft",
          title: "Draft",
          starting_position: "Supine",
        }),
      ]);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const response = await handleExerciseMediaRequest(
        new Request(
          `http://127.0.0.1/api/exercise-versions/${versionId}/media?access=internal`,
          { method: "GET" },
        ),
        deps,
        {},
      );
      expect(response?.status).toBe(401);
      expect(response?.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response?.json()).resolves.toEqual({ error: "unauthorized" });
    } finally {
      storage.close();
    }
  });

  it("pins Cache-Control no-store on approved public serve 200 (N5b)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { versionId } = await seedApprovedExerciseVersionWithMedia(
        storage,
        practitionerId,
      );
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const response = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          headers: { cookie: exerciseMediaSessionCookie(deps) },
        }),
        deps,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      const body = (await response.json()) as { mediaSetId?: string };
      expect(body.mediaSetId).toBeTruthy();
    } finally {
      storage.close();
    }
  });

  it("pins Cache-Control no-store on internal serve version_not_found error (N7)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practA = await seedPractitioner(
        storage,
        testOpaqueEntityId("didi-1155-error-a"),
        "a@example.com",
      );
      const practB = await seedPractitioner(
        storage,
        testOpaqueEntityId("didi-1155-error-b"),
        "b@example.com",
      );
      const exerciseId = await seedExercise(storage, practB);
      const draftVersionId = testOpaqueEntityId("didi-1155-foreign-draft");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: draftVersionId,
          exercise_id: exerciseId,
          status: "draft",
          title: "Foreign draft",
          starting_position: "Supine",
        }),
      ]);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId: practA,
        email: "a@example.com",
        displayName: "A",
      });
      const response = await handleRequest(
        new Request(
          `${BASE}/api/exercise-versions/${draftVersionId}/media?access=internal`,
          { headers: { cookie: exerciseMediaSessionCookie(deps) } },
        ),
        deps,
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response.json()).resolves.toEqual({
        error: "version_not_found",
        message: "Exercise version not found",
      });
    } finally {
      storage.close();
    }
  });

  it("returns 500 with Cache-Control no-store when media serve throws unexpectedly", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { versionId } = await seedApprovedExerciseVersionWithMedia(
        storage,
        practitionerId,
      );
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      vi.spyOn(
        ExerciseMediaService.prototype,
        "getMediaForServing",
      ).mockRejectedValueOnce(new Error("storage blew up"));
      const response = await handleExerciseMediaRequest(
        new Request(
          `http://127.0.0.1/api/exercise-versions/${versionId}/media?access=public`,
          { method: "GET" },
        ),
        deps,
        {
          sessionPractitioner: {
            practitionerId,
            email: "coach@example.com",
            displayName: "Coach",
          },
        },
      );
      expect(response?.status).toBe(500);
      expect(response?.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response?.json()).resolves.toEqual({ error: "internal_error" });
    } finally {
      vi.restoreAllMocks();
      storage.close();
    }
  });

  it("sets Cache-Control no-store on anonymous /api 401 from jsonUnauthorized (session guard)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const response = await handleRequest(
        new Request(`${BASE}${EXERCISE_MEDIA_REGENERATION_QUOTA_PATH}`, {
          method: "GET",
        }),
        deps,
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    } finally {
      storage.close();
    }
  });
});
