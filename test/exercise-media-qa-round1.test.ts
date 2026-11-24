import { describe, expect, it, vi } from "vitest";
import { validateMediaRegenerationNote } from "../src/domain/exercise-free-text.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import {
  DAILY_MEDIA_REGENERATION_CAP,
  ExerciseMediaService,
} from "../src/services/exercise-media/exercise-media-service.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

describe("exercise media QA round 1 (integration and unit)", () => {
  it("pins the daily cap constant at 5", () => {
    expect(DAILY_MEDIA_REGENERATION_CAP).toBe(5);
  });

  it("accepts regeneration notes at 199 and 200 characters and rejects 201", () => {
    expect(validateMediaRegenerationNote("a".repeat(199))).toHaveLength(199);
    expect(validateMediaRegenerationNote("a".repeat(200))).toHaveLength(200);
    expect(() => validateMediaRegenerationNote("a".repeat(201))).toThrow();
  });

  it("rejects invalid visibility, scope, and had_note CHECK values in migration 0003", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      await expect(
        storage.run(
          `INSERT INTO exercise_media_sets (
            id, start_object_key, end_object_key, start_provider_url, visibility, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          ["ms-bad-vis", "a/start.png", "a/end.png", null, "hidden", TS],
        ),
      ).rejects.toThrow();
      await expect(
        storage.run(
          `INSERT INTO media_regenerations (
            id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id("r1"), practitionerId, exerciseId, null, "all", 0, TS],
        ),
      ).rejects.toThrow();
      await expect(
        storage.run(
          `INSERT INTO media_regenerations (
            id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id("r2"), practitionerId, exerciseId, null, "start", 2, TS],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("stores approved regenerations as private draft media, not public", async () => {
    const storage = await openMigratedDatabase();
    const media = new PrefixMediaStorage(new InMemoryObjectStorage());
    const putSpy = vi.spyOn(media, "putImage");
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      const approvedVersionId = id("ver-approved");
      const liveSetId = id("live-set");
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, ending_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (${Array(23).fill("?").join(", ")})`,
        versionInsertBindings({
          id: approvedVersionId,
          exercise_id: exerciseId,
          version_number: 1,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
          title: "Bridge",
        }),
      );
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          liveSetId,
          `media-sets/${liveSetId}/start.png`,
          `media-sets/${liveSetId}/end.png`,
          null,
          "public",
          TS,
        ],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        liveSetId,
        approvedVersionId,
      ]);
      let tick = 0;
      const service = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        media,
        () => new Date(`2026-10-30T12:00:${String(tick++).padStart(2, "0")}.000Z`),
        () => id(`media-id-${tick}`),
      );
      putSpy.mockClear();
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: approvedVersionId,
        scope: "start",
      });
      for (const call of putSpy.mock.calls) {
        expect(call[3]).toBe("draft");
      }
      const row = await storage.first<{ visibility: string }>(
        "SELECT visibility FROM exercise_media_sets ORDER BY created_at DESC LIMIT 1",
      );
      expect(row?.visibility).toBe("draft");
    } finally {
      storage.close();
    }
  });

  it("public serving requires an approved version even when media visibility is public", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      const draftVersionId = id("ver-draft-public-media");
      const mediaSetId = id("ms-public-draft");
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, ending_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (${Array(23).fill("?").join(", ")})`,
        versionInsertBindings({
          id: draftVersionId,
          exercise_id: exerciseId,
          status: "draft",
          title: "Heel slide",
        }),
      );
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mediaSetId,
          `media-sets/${mediaSetId}/start.png`,
          `media-sets/${mediaSetId}/end.png`,
          null,
          "public",
          TS,
        ],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        draftVersionId,
      ]);
      const service = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(new InMemoryObjectStorage()),
      );
      await expect(
        service.getMediaForServing(draftVersionId, "public"),
      ).rejects.toMatchObject({ code: "version_not_found" });
      await expect(
        service.getMediaForServing(draftVersionId, "public", practitionerId),
      ).rejects.toMatchObject({ code: "version_not_found" });
      expect(
        await service.getMediaForServing(draftVersionId, "internal", practitionerId),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("counts regeneration quota only within the UTC day window", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      const quotaVersionId = id("ver-quota");
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, ending_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (${Array(23).fill("?").join(", ")})`,
        versionInsertBindings({
          id: quotaVersionId,
          exercise_id: exerciseId,
          status: "draft",
          title: "Bridge",
        }),
      );
      await storage.run(
        `INSERT INTO media_regenerations (
          id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id("old-regen"),
          practitionerId,
          exerciseId,
          quotaVersionId,
          "start",
          0,
          "2026-10-29T23:59:59.000Z",
        ],
      );
      const service = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(new InMemoryObjectStorage()),
        () => new Date("2026-10-30T00:00:01.000Z"),
      );
      const quota = await service.getRegenerationQuota(practitionerId);
      expect(quota.used).toBe(0);
      expect(quota.remaining).toBe(5);
    } finally {
      storage.close();
    }
  });
});
