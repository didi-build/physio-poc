import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { EXERCISE_MEDIA_REGENERATION_QUOTA_PATH } from "../src/exercise-media-api-paths.js";
import {
  exerciseMediaTestDeps,
  exerciseMediaSessionCookie,
} from "./helpers/exercise-media-http.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersionWithMedia,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";

const BASE = "https://physio.test.example";
const CACHE_NO_STORE = "no-store";
const UNAUTHORIZED_BODY = { error: "unauthorized" } as const;
const FORBIDDEN_BODY = { error: "forbidden" } as const;
const INTERNAL_ERROR_BODY = { error: "internal_error" } as const;

const UNREGISTERED_API_POST = "/api/unregistered-didi-1155-probe";

describe("HTTP JSON auth Cache-Control (DIDI-1155 app-wide)", () => {
  it("pins Cache-Control no-store on jsonUnauthorized from the /api session guard (non-media)", async () => {
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
      await expect(response.json()).resolves.toEqual(UNAUTHORIZED_BODY);
    } finally {
      storage.close();
    }
  });

  it("pins Cache-Control no-store on jsonForbidden from CSRF rejection (non-media)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const cookie = (deps.auth as FakeAuthPort).createSessionCookieHeader();
      const response = await handleRequest(
        new Request(`${BASE}${UNREGISTERED_API_POST}`, {
          method: "POST",
          headers: {
            cookie,
            origin: "https://evil.example.com",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response.json()).resolves.toEqual(FORBIDDEN_BODY);
    } finally {
      storage.close();
    }
  });
});

describe("exercise media serve DIDI-1155 (review follow-up)", () => {
  it("anonymous access=public: /api session guard returns 401 before the media handler", async () => {
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
      const getPractitioner = vi.spyOn(deps.auth, "getPractitioner");
      const response = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          method: "GET",
        }),
        deps,
      );
      expect(getPractitioner).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response.json()).resolves.toEqual(UNAUTHORIZED_BODY);
    } finally {
      storage.close();
    }
  });

  it("logs request_failed and returns 500 JSON with no-store on uncaught media serve errors", async () => {
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
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { ExerciseMediaService } =
        await import("../src/services/exercise-media/exercise-media-service.js");
      const boom = new Error("storage blew up");
      vi.spyOn(
        ExerciseMediaService.prototype,
        "getMediaForServing",
      ).mockRejectedValueOnce(boom);
      const response = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          headers: { cookie: exerciseMediaSessionCookie(deps) },
        }),
        deps,
      );
      expect(errorSpy).toHaveBeenCalledWith("request_failed", boom);
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe(CACHE_NO_STORE);
      await expect(response.json()).resolves.toEqual(INTERNAL_ERROR_BODY);
    } finally {
      vi.restoreAllMocks();
      storage.close();
    }
  });
});
