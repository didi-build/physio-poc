import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersionWithMedia,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  exerciseMediaTestDeps,
  exerciseMediaSessionCookie,
} from "./helpers/exercise-media-http.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

const VERSION_NOT_FOUND_BODY = {
  error: "version_not_found",
  message: "Exercise version not found",
} as const;

describe("exercise media approved pending draft (f0ce9ed6)", () => {
  it("keeps public live media after regenerate on an approved version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { versionId, mediaSetId: liveMediaSetId } =
        await seedApprovedExerciseVersionWithMedia(storage, practitionerId);
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { exerciseMediaImages: new FakeImageGeneration() },
      );
      const cookie = exerciseMediaSessionCookie(deps);
      const regenUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/regenerate`;
      const regen = await handleRequest(
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
      expect(regen.status).toBe(200);
      const regenBody = (await regen.json()) as {
        outcome?: string;
        media?: { mediaSetId: string; visibility: string };
      };
      expect(regenBody.outcome).toBe("pending_draft_updated");
      expect(regenBody.media?.visibility).toBe("draft");
      expect(regenBody.media?.mediaSetId).not.toBe(liveMediaSetId);

      const publicServe = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          headers: { cookie },
        }),
        deps,
      );
      expect(publicServe.status).toBe(200);
      await expect(publicServe.json()).resolves.toEqual({
        mediaSetId: liveMediaSetId,
        startObjectKey: `media-sets/${liveMediaSetId}/start.png`,
        endObjectKey: `media-sets/${liveMediaSetId}/end.png`,
        visibility: "public",
      });

      const versionRow = await storage.first<{
        media_set_id: string | null;
        pending_media_set_id: string | null;
      }>(
        "SELECT media_set_id, pending_media_set_id FROM exercise_versions WHERE id = ?",
        [versionId],
      );
      expect(versionRow?.media_set_id).toBe(liveMediaSetId);
      expect(versionRow?.pending_media_set_id).toBe(regenBody.media?.mediaSetId);
    } finally {
      storage.close();
    }
  });

  it("serves pending draft only to the owner with Cache-Control no-store", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerId = await seedPractitioner(
        storage,
        testOpaqueEntityId("owner"),
        "owner@ex.com",
      );
      const otherId = await seedPractitioner(
        storage,
        testOpaqueEntityId("other"),
        "other@ex.com",
      );
      const { versionId, mediaSetId: liveMediaSetId } =
        await seedApprovedExerciseVersionWithMedia(storage, ownerId);
      const ownerDeps = exerciseMediaTestDeps(storage, {
        practitionerId: ownerId,
        email: "owner@ex.com",
        displayName: "Owner",
      });
      const ownerCookie = exerciseMediaSessionCookie(ownerDeps);
      const regenUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/regenerate`;
      const regen = await handleRequest(
        new Request(
          regenUrl,
          mutatingAppApiRequestInit(regenUrl, {
            method: "POST",
            headers: { cookie: ownerCookie, "content-type": "application/json" },
            body: JSON.stringify({ scope: "both" }),
          }),
        ),
        ownerDeps,
      );
      const { media } = (await regen.json()) as {
        media: { mediaSetId: string; visibility: string };
      };

      const internal = await handleRequest(
        new Request(
          `${BASE}/api/exercise-versions/${versionId}/media?access=internal`,
          { headers: { cookie: ownerCookie } },
        ),
        ownerDeps,
      );
      expect(internal.status).toBe(200);
      expect(internal.headers.get("cache-control")).toBe("no-store");
      await expect(internal.json()).resolves.toEqual({
        mediaSetId: media.mediaSetId,
        startObjectKey: `media-sets/${media.mediaSetId}/start.png`,
        endObjectKey: `media-sets/${media.mediaSetId}/end.png`,
        visibility: "draft",
      });

      const otherDeps = exerciseMediaTestDeps(storage, {
        practitionerId: otherId,
        email: "other@ex.com",
        displayName: "Other",
      });
      const otherCookie = exerciseMediaSessionCookie(otherDeps);
      const denied = await handleRequest(
        new Request(
          `${BASE}/api/exercise-versions/${versionId}/media?access=internal`,
          { headers: { cookie: otherCookie } },
        ),
        otherDeps,
      );
      expect(denied.status).toBe(404);
      await expect(denied.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);

      const publicStillLive = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          headers: { cookie: ownerCookie },
        }),
        ownerDeps,
      );
      expect(publicStillLive.status).toBe(200);
      const publicBody = (await publicStillLive.json()) as { mediaSetId: string };
      expect(publicBody.mediaSetId).toBe(liveMediaSetId);
    } finally {
      storage.close();
    }
  });

  it("writes pending draft on generate for an approved version without live media", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = testOpaqueEntityId("ex-approved-gen");
      const versionId = testOpaqueEntityId("ver-approved-gen");
      await storage.run(
        `INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, 'stretch', ?, ?)`,
        [exerciseId, practitionerId, TS],
      );
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (?, ?, 1, 'approved', ?, ?, 'Title', '', '', '', '', '', '', '', '', NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
        [versionId, exerciseId, practitionerId, TS, TS],
      );
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const cookie = exerciseMediaSessionCookie(deps);
      const genUrl = `${BASE}/api/me/exercise-versions/${versionId}/media/generate`;
      const gen = await handleRequest(
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
      expect(gen.status).toBe(201);
      const genBody = (await gen.json()) as {
        media: { mediaSetId: string; visibility: string };
      };
      expect(genBody.media.visibility).toBe("draft");

      const publicServe = await handleRequest(
        new Request(`${BASE}/api/exercise-versions/${versionId}/media?access=public`, {
          headers: { cookie },
        }),
        deps,
      );
      expect(publicServe.status).toBe(404);

      const versionRow = await storage.first<{
        media_set_id: string | null;
        pending_media_set_id: string | null;
      }>(
        "SELECT media_set_id, pending_media_set_id FROM exercise_versions WHERE id = ?",
        [versionId],
      );
      expect(versionRow?.media_set_id).toBeNull();
      expect(versionRow?.pending_media_set_id).toBe(genBody.media.mediaSetId);
    } finally {
      storage.close();
    }
  });
});
