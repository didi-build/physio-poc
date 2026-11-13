import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/entry/worker.js";
import { PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY } from "../src/services/programs/public-share-link-media.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { R2ObjectStorage } from "../src/adapters/workers/r2-object-storage.js";
import { createFakeR2Bucket } from "./helpers/fake-r2-bucket.js";
import { ProgramPublishService } from "../src/services/programs/program-publish-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { publicShareLinkMediaApiPath } from "../src/programs-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import {
  buildWorkerProductionAuthEnv,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import {
  d1DatabaseFromSqlite,
  openWorkerAuthTestDatabase,
} from "./helpers/worker-auth-d1-fixture.js";
import {
  resetWorkerProductionAuthCacheForTests,
  resetWorkerProductionModuleImportForTests,
} from "../src/adapters/workers/create-app-dependencies.js";
import * as workerProductionDeps from "../src/adapters/workers/create-worker-production-app-dependencies.js";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describe("Worker public share link media (DIDI-1191)", () => {
  it("pins the ADR 0009 code-only not_found JSON body literal", () => {
    expect(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY).toBe('{"error":"not_found"}');
  });
  let workerObjects: InMemoryObjectStorage;

  beforeEach(() => {
    workerObjects = new InMemoryObjectStorage();
    resetWorkerProductionAuthCacheForTests();
    resetWorkerProductionModuleImportForTests();
    const realCreate = workerProductionDeps.createWorkerProductionAppDependencies;
    vi.spyOn(
      workerProductionDeps,
      "createWorkerProductionAppDependencies",
    ).mockImplementation((env) => ({ ...realCreate(env), objects: workerObjects }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetWorkerProductionAuthCacheForTests();
    resetWorkerProductionModuleImportForTests();
  });

  it("returns not_found JSON for unknown link media on the Worker", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    try {
      const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
      const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });
      const response = await worker.fetch(
        new Request(
          `${WORKER_PRODUCTION_TEST_BASE}${publicShareLinkMediaApiPath(
            "not-a-real-token",
            FIXTURE_VERSION_ID,
            "start",
          )}`,
        ),
        env,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("serves link-scoped media bytes on the Worker entry without a session", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-worker-1191");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Worker media",
      });
      await seedApprovedExerciseVersion(storage, practitionerId);
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-worker-1191"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, sets: 3, days_per_week: 3 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const mediaSetId = id("ms-worker-1191");
      const startKey = `media-sets/${mediaSetId}/start.png`;
      const endKey = `media-sets/${mediaSetId}/end.png`;
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [mediaSetId, startKey, endKey, null, "public", TS],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        FIXTURE_VERSION_ID,
      ]);
      const media = new PrefixMediaStorage(workerObjects);
      await media.putImage(startKey, PNG_BYTES, "image/png", "public");
      await media.putImage(endKey, PNG_BYTES, "image/png", "public");

      const publish = new ProgramPublishService(
        storage,
        WORKER_PRODUCTION_TEST_BASE,
        () => TS,
      );
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
      const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });

      const response = await worker.fetch(
        new Request(
          `${WORKER_PRODUCTION_TEST_BASE}${publicShareLinkMediaApiPath(
            token,
            FIXTURE_VERSION_ID,
            "start",
          )}`,
        ),
        env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
    } finally {
      storage.close();
    }
  });

  it("serves end-phase bytes on the Worker entry", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-worker-1191-end");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Worker media end",
      });
      await seedApprovedExerciseVersion(storage, practitionerId);
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-worker-1191-end"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, sets: 3, days_per_week: 3 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const mediaSetId = id("ms-worker-1191-end");
      const startKey = `media-sets/${mediaSetId}/start.png`;
      const endKey = `media-sets/${mediaSetId}/end.png`;
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [mediaSetId, startKey, endKey, null, "public", TS],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        FIXTURE_VERSION_ID,
      ]);
      const media = new PrefixMediaStorage(workerObjects);
      await media.putImage(startKey, PNG_BYTES, "image/png", "public");
      await media.putImage(endKey, PNG_BYTES, "image/png", "public");

      const publish = new ProgramPublishService(
        storage,
        WORKER_PRODUCTION_TEST_BASE,
        () => TS,
      );
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
      const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });

      const response = await worker.fetch(
        new Request(
          `${WORKER_PRODUCTION_TEST_BASE}${publicShareLinkMediaApiPath(
            token,
            FIXTURE_VERSION_ID,
            "end",
          )}`,
        ),
        env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
    } finally {
      storage.close();
    }
  });
});

describe("Worker public share link media via R2 production wiring (DIDI-1040)", () => {
  afterEach(() => {
    resetWorkerProductionAuthCacheForTests();
    resetWorkerProductionModuleImportForTests();
  });

  it("serves bytes from PHYSIO_MEDIA without substituting in-memory objects", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-worker-1040-r2");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Worker R2 media",
      });
      await seedApprovedExerciseVersion(storage, practitionerId);
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-worker-1040-r2"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, sets: 3, days_per_week: 3 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const mediaSetId = id("ms-worker-1040-r2");
      const startKey = `media-sets/${mediaSetId}/start.png`;
      const endKey = `media-sets/${mediaSetId}/end.png`;
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [mediaSetId, startKey, endKey, null, "public", TS],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        FIXTURE_VERSION_ID,
      ]);
      const bucket = createFakeR2Bucket();
      const media = new PrefixMediaStorage(new R2ObjectStorage(bucket));
      await media.putImage(startKey, PNG_BYTES, "image/png", "public");

      const publish = new ProgramPublishService(
        storage,
        WORKER_PRODUCTION_TEST_BASE,
        () => TS,
      );
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
      const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1, PHYSIO_MEDIA: bucket });

      const response = await worker.fetch(
        new Request(
          `${WORKER_PRODUCTION_TEST_BASE}${publicShareLinkMediaApiPath(
            token,
            FIXTURE_VERSION_ID,
            "start",
          )}`,
        ),
        env,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
    } finally {
      storage.close();
    }
  });

  it("returns not_found JSON when gates pass but object bytes are missing in R2", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-worker-1040-miss");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Worker R2 missing bytes",
      });
      await seedApprovedExerciseVersion(storage, practitionerId);
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-worker-1040-miss"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, sets: 3, days_per_week: 3 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const mediaSetId = id("ms-worker-1040-miss");
      const startKey = `media-sets/${mediaSetId}/start.png`;
      const endKey = `media-sets/${mediaSetId}/end.png`;
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [mediaSetId, startKey, endKey, null, "public", TS],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        FIXTURE_VERSION_ID,
      ]);

      const publish = new ProgramPublishService(
        storage,
        WORKER_PRODUCTION_TEST_BASE,
        () => TS,
      );
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });

      const response = await worker.fetch(
        new Request(
          `${WORKER_PRODUCTION_TEST_BASE}${publicShareLinkMediaApiPath(
            token,
            FIXTURE_VERSION_ID,
            "start",
          )}`,
        ),
        env,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("returns not_found JSON for an invalid token without bytes in R2", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    try {
      const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      const response = await worker.fetch(
        new Request(
          `${WORKER_PRODUCTION_TEST_BASE}${publicShareLinkMediaApiPath(
            "not-a-real-token",
            FIXTURE_VERSION_ID,
            "start",
          )}`,
        ),
        env,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });
});
