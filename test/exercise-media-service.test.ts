import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildEndImagePrompt,
  buildStartImagePrompt,
} from "../src/domain/exercise-media-prompts.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { applyMigration, MIGRATION_0002_ID } from "../src/storage/migrations/apply.js";
import {
  ExerciseMediaService,
  DAILY_MEDIA_REGENERATION_CAP,
} from "../src/services/exercise-media/exercise-media-service.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const MIGRATION_0002_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0002_exercise_media.sql"),
  "utf8",
);

describe("exercise media prompts (unit)", () => {
  it("uses the shared clinical illustration template without patient-specific fields", () => {
    const start = buildStartImagePrompt({
      title: "Heel slide",
      startingPosition: "Supine, knees bent",
      regenerationNote: "slower tempo",
    });
    expect(start).toContain("Clinical physiotherapy exercise demonstration");
    expect(start).toContain("Heel slide");
    expect(start).toContain("starting position");
    expect(start).toContain("slower tempo");
    expect(start).not.toMatch(/patient|diagnosis|PHI/i);
  });

  it("builds distinct start and end prompts", () => {
    const ctx = { title: "Bridge", startingPosition: "Supine" };
    expect(buildStartImagePrompt(ctx)).toContain("starting position");
    expect(buildEndImagePrompt(ctx)).toContain("end position");
  });
});

describe("prefix media storage (unit)", () => {
  it("does not expose draft objects via getPublicImage", async () => {
    const objects = new InMemoryObjectStorage();
    const media = new PrefixMediaStorage(objects);
    await media.putImage("k/start.png", new Uint8Array([1]), "image/png", "draft");
    expect(await media.getPublicImage("k/start.png")).toBeNull();
    expect(await media.getImage("k/start.png", "draft")).not.toBeNull();
  });
});

describe("ExerciseMediaService (integration)", () => {
  async function seedDraftVersion(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  ) {
    const practitionerId = await seedPractitioner(storage);
    const exerciseId = await seedExercise(storage, practitionerId);
    await storage.run(
      `INSERT INTO exercise_versions (
        id, exercise_id, version_number, status, approved_by, approved_at,
        title, description, equipment, starting_position, steps,
        common_mistakes, regressions, progressions, precautions,
        cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
        media_set_id, change_summary, created_at
      ) VALUES (${Array(22).fill("?").join(", ")})`,
      versionInsertBindings({
        id: "ver-draft",
        exercise_id: exerciseId,
        status: "draft",
        title: "Heel slide",
        starting_position: "Supine",
      }),
    );
    return { practitionerId, exerciseId, versionId: "ver-draft" };
  }

  async function createService(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  ) {
    const images = new FakeImageGeneration();
    const media = new PrefixMediaStorage(new InMemoryObjectStorage());
    let tick = 0;
    const service = new ExerciseMediaService(
      storage,
      images,
      media,
      () => new Date(`2026-10-30T12:00:${String(tick++).padStart(2, "0")}.000Z`),
      () => `id-${tick}`,
    );
    return { service, media };
  }

  it("applies migration 0002", async () => {
    const storage = await openMigratedDatabase();
    try {
      await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
      const tables = await storage.all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('exercise_media_sets', 'media_regenerations')",
      );
      expect(tables.map((t) => t.name).sort()).toEqual([
        "exercise_media_sets",
        "media_regenerations",
      ]);
    } finally {
      storage.close();
    }
  });

  it("stores draft media as non-public until promotion", async () => {
    const storage = await openMigratedDatabase();
    await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
    try {
      const { versionId } = await seedDraftVersion(storage);
      const { service, media } = await createService(storage);
      const created = await service.generateInitialMediaForVersion({
        exerciseVersionId: versionId,
      });
      expect(created.visibility).toBe("draft");
      expect(await media.getPublicImage(created.startObjectKey)).toBeNull();
      const promoted = await service.promoteDraftMediaOnApproval(versionId);
      expect(promoted?.visibility).toBe("public");
      expect(await media.getPublicImage(created.startObjectKey)).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("enforces five regenerations per practitioner per UTC day", async () => {
    const storage = await openMigratedDatabase();
    await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const { service } = await createService(storage);
      await service.generateInitialMediaForVersion({ exerciseVersionId: versionId });
      for (let i = 0; i < DAILY_MEDIA_REGENERATION_CAP; i += 1) {
        await service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        });
      }
      const quota = await service.getRegenerationQuota(practitionerId);
      expect(quota.limitReached).toBe(true);
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "end",
        }),
      ).rejects.toMatchObject({ code: "daily_limit_reached" });
    } finally {
      storage.close();
    }
  });

  it("creates a new approved version when regenerating media on an approved exercise", async () => {
    const storage = await openMigratedDatabase();
    await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (${Array(22).fill("?").join(", ")})`,
        versionInsertBindings({
          id: "ver-approved-1",
          exercise_id: exerciseId,
          version_number: 1,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
          title: "Bridge",
        }),
      );
      const { service } = await createService(storage);
      await service.generateInitialMediaForVersion({
        exerciseVersionId: "ver-approved-1",
      });
      const result = await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: "ver-approved-1",
        scope: "both",
        note: "deeper range",
      });
      expect(result.outcome).toBe("new_approved_version");
      if (result.outcome === "new_approved_version") {
        expect(result.newVersionNumber).toBe(2);
        expect(result.media.visibility).toBe("public");
      }
      const versions = await storage.all<{ version_number: number; status: string }>(
        "SELECT version_number, status FROM exercise_versions WHERE exercise_id = ? ORDER BY version_number",
        [exerciseId],
      );
      expect(versions).toEqual([
        { version_number: 1, status: "approved" },
        { version_number: 2, status: "approved" },
      ]);
    } finally {
      storage.close();
    }
  });
});
