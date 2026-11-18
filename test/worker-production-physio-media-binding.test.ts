import { describe, expect, it, vi } from "vitest";
import worker from "../src/entry/worker.js";
import {
  MediaBindingMissingObjectStorage,
  MediaStorageUnavailableError,
} from "../src/adapters/workers/media-binding-missing-object-storage.js";
import { publicShareLinkMediaApiPath } from "../src/programs-api-paths.js";
import { ProgramPublishService } from "../src/services/programs/program-publish-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import {
  resetWorkerProductionAuthCacheForTests,
  resetWorkerProductionModuleImportForTests,
} from "../src/adapters/workers/create-app-dependencies.js";
import { resetWorkerMediaBindingMissingLogForTests } from "../src/adapters/workers/media-binding-missing-object-storage.js";
import {
  buildWorkerProductionAuthEnv,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import {
  d1DatabaseFromSqlite,
  openWorkerAuthTestDatabase,
  seedPractitioner,
} from "./helpers/worker-auth-d1-fixture.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  seedApprovedExerciseVersion,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";

const WORKER_BASE = WORKER_PRODUCTION_TEST_BASE;

describe("Worker production PHYSIO_MEDIA binding (DIDI-1040)", () => {
  it("missing PHYSIO_MEDIA keeps auth and non-media routes up; published link media 404s via storage stub", async () => {
    resetWorkerProductionAuthCacheForTests();
    resetWorkerProductionModuleImportForTests();
    resetWorkerMediaBindingMissingLogForTests();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const stubGetSpy = vi.spyOn(MediaBindingMissingObjectStorage.prototype, "get");
    try {
      const { storage } = await openWorkerAuthTestDatabase();
      try {
        const practitionerId = await seedPractitioner(
          storage,
          undefined,
          FAKE_GOOGLE_ALLOWED_EMAIL,
        );
        const programId = id("prog-b2-missing-media");
        await new ProgramsRepository(storage).create({
          id: programId,
          createdBy: practitionerId,
          createdAt: TS,
          name: "B2 missing PHYSIO_MEDIA",
        });
        await seedApprovedExerciseVersion(storage, practitionerId);
        await new ProgramRowsRepository(storage).replaceRow({
          id: id("row-b2-missing-media"),
          programId,
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30, sets: 3, days_per_week: 3 },
          textSnapshot: { title: "Heel slide" },
          draftUpdatedAt: TS,
        });
        const mediaSetId = id("ms-b2-missing-media");
        const startKey = `media-sets/${mediaSetId}/start.png`;
        const endKey = `media-sets/${mediaSetId}/end.png`;
        await storage.run(
          `INSERT INTO exercise_media_sets (
            id, start_object_key, end_object_key, start_provider_url, visibility, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [mediaSetId, startKey, endKey, null, "public", TS],
        );
        await storage.run(
          "UPDATE exercise_versions SET media_set_id = ? WHERE id = ?",
          [mediaSetId, FIXTURE_VERSION_ID],
        );
        const published = await new ProgramPublishService(
          storage,
          WORKER_BASE,
          () => TS,
        ).publishProgram(practitionerId, programId);
        const token = decodeURIComponent(published.share_link.split("/l/")[1]!);

        const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
        const env = buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: undefined,
        });

        const health = await worker.fetch(new Request(`${WORKER_BASE}/health`), env);
        expect(health.status).toBe(200);

        const signIn = await worker.fetch(
          new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
          env,
        );
        expect(signIn.status).toBe(400);

        const media = await worker.fetch(
          new Request(
            `${WORKER_BASE}${publicShareLinkMediaApiPath(
              token,
              FIXTURE_VERSION_ID,
              "start",
            )}`,
          ),
          env,
        );
        expect(media.status).toBe(404);
        expect(await media.text()).toBe('{"error":"not_found"}');

        expect(stubGetSpy).toHaveBeenCalled();
        for (const { value } of stubGetSpy.mock.results) {
          await expect(value).rejects.toThrow(MediaStorageUnavailableError);
        }

        await worker.fetch(new Request(`${WORKER_BASE}/health`), env);
        expect(
          logSpy.mock.calls.filter(
            (call) => call[0] === "physio_worker_media_binding_missing",
          ),
        ).toEqual([["physio_worker_media_binding_missing"]]);
      } finally {
        storage.close();
      }
    } finally {
      stubGetSpy.mockRestore();
      logSpy.mockRestore();
      resetWorkerProductionAuthCacheForTests();
      resetWorkerProductionModuleImportForTests();
      resetWorkerMediaBindingMissingLogForTests();
    }
  });

  it("missing auth secret still fails the whole Worker closed with auth misconfig log", async () => {
    resetWorkerProductionAuthCacheForTests();
    resetWorkerProductionModuleImportForTests();
    resetWorkerMediaBindingMissingLogForTests();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { storage } = await openWorkerAuthTestDatabase();
      try {
        const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
        const env = buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          BETTER_AUTH_SECRET: "too-short",
        });

        const auth = await worker.fetch(
          new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
          env,
        );
        expect(auth.status).toBe(503);
        expect(logSpy).toHaveBeenCalledWith(
          "physio_worker_production_auth_misconfigured",
        );
        expect(logSpy).not.toHaveBeenCalledWith("physio_worker_media_binding_missing");
      } finally {
        storage.close();
      }
    } finally {
      logSpy.mockRestore();
      resetWorkerProductionAuthCacheForTests();
      resetWorkerProductionModuleImportForTests();
      resetWorkerMediaBindingMissingLogForTests();
    }
  });
});
