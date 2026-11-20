import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import type { ImageGenerationPort } from "../src/storage/ports/image-generation.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersionWithMedia,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  exerciseMediaTestDeps,
  exerciseMediaSessionCookie,
} from "./helpers/exercise-media-http.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { publicShareLinkMediaApiPath } from "../src/programs-api-paths.js";
import {
  ProgramsRepository,
  ProgramRowsRepository,
} from "../src/storage/repositories/programs.js";
import { ProgramPublishService } from "../src/services/programs/program-publish-service.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const WEB_BASE = "https://physio.test.example";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const VERSION_NOT_FOUND_BODY = {
  error: "version_not_found",
  message: "Exercise version not found",
} as const;

const EXERCISE_MEDIA_ALREADY_GENERATED_409_BODY = {
  error: "exercise_media_already_generated",
} as const;

async function publishProgramWithVersion(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  versionId: string,
  mediaSetId: string,
  objects: InMemoryObjectStorage,
) {
  const programId = id("prog-c6-share");
  const programs = new ProgramsRepository(storage);
  await programs.create({
    id: programId,
    createdBy: practitionerId,
    createdAt: TS,
    name: "Pending media share pin",
  });
  await new ProgramRowsRepository(storage).replaceRow({
    id: id("row-c6"),
    programId,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: versionId,
    prescriptionType: "stretching",
    params: { hold_s: 30, sets: 3, days_per_week: 3 },
    textSnapshot: { title: "Heel slide" },
    draftUpdatedAt: TS,
  });
  const startKey = `media-sets/${mediaSetId}/start.png`;
  const endKey = `media-sets/${mediaSetId}/end.png`;
  const media = new PrefixMediaStorage(objects);
  await media.putImage(startKey, PNG_BYTES, "image/png", "public");
  await media.putImage(endKey, PNG_BYTES, "image/png", "public");
  const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
  const result = await publish.publishProgram(practitionerId, programId);
  const token = decodeURIComponent(result.share_link.split("/l/")[1]!);
  return { token, startKey };
}

describe("exercise media pending model (c6cac926)", () => {
  it("migration 0011 adds nullable pending columns with no backfill on existing rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: FIXTURE_VERSION_ID,
          exercise_id: exerciseId,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
        }),
      ]);
      const row = await storage.first<{
        pending_media_set_id: string | null;
        pending_media_requested_by: string | null;
      }>(
        `SELECT pending_media_set_id, pending_media_requested_by
         FROM exercise_versions WHERE id = ?`,
        [FIXTURE_VERSION_ID],
      );
      expect(row?.pending_media_set_id).toBeNull();
      expect(row?.pending_media_requested_by).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("returns 409 with zero upstream calls when only pending media exists", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = testOpaqueEntityId("ex-pending-only");
      const versionId = testOpaqueEntityId("ver-pending-only");
      await storage.run(
        `INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, 'stretch', ?, ?)`,
        [exerciseId, practitionerId, TS],
      );
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
        }),
      ]);
      let upstreamCalls = 0;
      const images: ImageGenerationPort = {
        async generateStartAndEndImages() {
          upstreamCalls += 1;
          return new FakeImageGeneration().generateStartAndEndImages({
            startPrompt: "s",
            endPrompt: "e",
          });
        },
        generateStartImage: (...args) =>
          new FakeImageGeneration().generateStartImage(...args),
        generateEndImage: (...args) =>
          new FakeImageGeneration().generateEndImage(...args),
      };
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { exerciseMediaImages: images },
      );
      const cookie = exerciseMediaSessionCookie(deps);
      const genUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/generate`;
      const first = await handleRequest(
        new Request(
          genUrl,
          mutatingAppApiRequestInit(genUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(first.status).toBe(201);
      expect(upstreamCalls).toBe(1);
      const second = await handleRequest(
        new Request(
          genUrl,
          mutatingAppApiRequestInit(genUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(second.status).toBe(409);
      await expect(second.json()).resolves.toEqual(
        EXERCISE_MEDIA_ALREADY_GENERATED_409_BODY,
      );
      expect(upstreamCalls).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("replaces pending media and deletes previous draft object keys", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { versionId } = await seedApprovedExerciseVersionWithMedia(
        storage,
        practitionerId,
      );
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { objects, exerciseMediaImages: new FakeImageGeneration() },
      );
      const cookie = exerciseMediaSessionCookie(deps);
      const regenUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/regenerate`;
      const first = await handleRequest(
        new Request(
          regenUrl,
          mutatingAppApiRequestInit(regenUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ scope: "both" }),
          }),
        ),
        deps,
      );
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as {
        media: { startObjectKey: string; endObjectKey: string };
      };
      expect(await objects.get(`draft/${firstBody.media.startObjectKey}`)).toBeTruthy();

      const second = await handleRequest(
        new Request(
          regenUrl,
          mutatingAppApiRequestInit(regenUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ scope: "both" }),
          }),
        ),
        deps,
      );
      expect(second.status).toBe(200);
      expect(await objects.get(`draft/${firstBody.media.startObjectKey}`)).toBeNull();
      expect(await objects.get(`draft/${firstBody.media.endObjectKey}`)).toBeNull();
      const firstPendingSetId = firstBody.media.startObjectKey.split("/")[1];
      const deletedRows = await storage.all<{ id: string }>(
        "SELECT id FROM exercise_media_sets WHERE id = ?",
        [firstPendingSetId],
      );
      expect(deletedRows).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("public serve and share-link media ignore pending_media_set_id", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { versionId, mediaSetId } = await seedApprovedExerciseVersionWithMedia(
        storage,
        practitionerId,
      );
      const { token, startKey } = await publishProgramWithVersion(
        storage,
        practitionerId,
        versionId,
        mediaSetId,
        objects,
      );
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { objects, exerciseMediaImages: new FakeImageGeneration() },
      );
      const cookie = exerciseMediaSessionCookie(deps);
      const regenUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/regenerate`;
      await handleRequest(
        new Request(
          regenUrl,
          mutatingAppApiRequestInit(regenUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ scope: "both" }),
          }),
        ),
        deps,
      );

      const publicServe = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          headers: { cookie },
        }),
        deps,
      );
      expect(publicServe.status).toBe(200);
      await expect(publicServe.json()).resolves.toEqual({
        mediaSetId: mediaSetId,
        startObjectKey: `media-sets/${mediaSetId}/start.png`,
        endObjectKey: `media-sets/${mediaSetId}/end.png`,
        visibility: "public",
      });

      const shareUrl = `${BASE}${publicShareLinkMediaApiPath(token, versionId, "start")}`;
      const share = await handleRequest(new Request(shareUrl), deps);
      expect(share.status).toBe(200);
      expect(new Uint8Array(await share.arrayBuffer())).toEqual(PNG_BYTES);
      expect(startKey).toBe(`media-sets/${mediaSetId}/start.png`);
    } finally {
      storage.close();
    }
  });

  it("rejects non-requester regenerate when pending was requested by someone else", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerId = await seedPractitioner(
        storage,
        testOpaqueEntityId("regen-owner"),
        "own@ex.com",
      );
      const otherId = await seedPractitioner(
        storage,
        testOpaqueEntityId("regen-other"),
        "oth@ex.com",
      );
      const { versionId } = await seedApprovedExerciseVersionWithMedia(
        storage,
        ownerId,
      );
      const ownerDeps = exerciseMediaTestDeps(storage, {
        practitionerId: ownerId,
        email: "own@ex.com",
        displayName: "Owner",
      });
      const regenUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/regenerate`;
      await handleRequest(
        new Request(
          regenUrl,
          mutatingAppApiRequestInit(regenUrl, {
            method: "POST",
            headers: {
              cookie: exerciseMediaSessionCookie(ownerDeps),
              "content-type": "application/json",
            },
            body: JSON.stringify({ scope: "both" }),
          }),
        ),
        ownerDeps,
      );
      await storage.run(
        "UPDATE exercise_versions SET pending_media_requested_by = ? WHERE id = ?",
        [otherId, versionId],
      );
      const denied = await handleRequest(
        new Request(
          regenUrl,
          mutatingAppApiRequestInit(regenUrl, {
            method: "POST",
            headers: {
              cookie: exerciseMediaSessionCookie(ownerDeps),
              "content-type": "application/json",
            },
            body: JSON.stringify({ scope: "both" }),
          }),
        ),
        ownerDeps,
      );
      expect(denied.status).toBe(404);
      await expect(denied.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("rejects non-requester internal serve with pinned 404 body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerId = await seedPractitioner(
        storage,
        testOpaqueEntityId("owner-b"),
        "b@ex.com",
      );
      const otherId = await seedPractitioner(
        storage,
        testOpaqueEntityId("other-a"),
        "a@ex.com",
      );
      const { versionId } = await seedApprovedExerciseVersionWithMedia(
        storage,
        ownerId,
      );
      const ownerDeps = exerciseMediaTestDeps(storage, {
        practitionerId: ownerId,
        email: "b@ex.com",
        displayName: "B",
      });
      const regenUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/regenerate`;
      await handleRequest(
        new Request(
          regenUrl,
          mutatingAppApiRequestInit(regenUrl, {
            method: "POST",
            headers: {
              cookie: exerciseMediaSessionCookie(ownerDeps),
              "content-type": "application/json",
            },
            body: JSON.stringify({ scope: "both" }),
          }),
        ),
        ownerDeps,
      );
      await storage.run(
        "UPDATE exercise_versions SET pending_media_requested_by = ? WHERE id = ?",
        [otherId, versionId],
      );
      const denied = await handleRequest(
        new Request(
          `${BASE}/api/exercise-versions/${versionId}/media?access=internal`,
          {
            headers: { cookie: exerciseMediaSessionCookie(ownerDeps) },
          },
        ),
        ownerDeps,
      );
      expect(denied.status).toBe(404);
      await expect(denied.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });
});
