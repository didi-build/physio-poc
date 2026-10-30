import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImageGenerationPort } from "../src/storage/ports/image-generation.js";
import {
  buildEndImagePrompt,
  buildStartImagePrompt,
} from "../src/domain/exercise-media-prompts.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { applyMigration, MIGRATION_0003_ID } from "../src/storage/migrations/apply.js";
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
const MIGRATION_0003_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0003_exercise_media.sql"),
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
    images: ImageGenerationPort = new FakeImageGeneration(),
  ) {
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
      await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
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
    await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
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
    await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
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
    await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
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
      const summaryRow = await storage.first<{ change_summary: string | null }>(
        "SELECT change_summary FROM exercise_versions WHERE exercise_id = ? AND version_number = 2",
        [exerciseId],
      );
      expect(summaryRow?.change_summary).toBe("Regenerated start and end images");
      expect(summaryRow?.change_summary).not.toContain("deeper range");
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

  it("does not persist regeneration note text; records had_note only", async () => {
    const storage = await openMigratedDatabase();
    await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
    const secretNote = "UNPERSISTED_REGEN_NOTE_xyzzy";
    const objects = new InMemoryObjectStorage();
    const objectPutSpy = vi.spyOn(objects, "put");
    const media = new PrefixMediaStorage(objects);
    const mediaPutSpy = vi.spyOn(media, "putImage");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      let tick = 0;
      const service = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        media,
        () => new Date(`2026-10-30T12:00:${String(tick++).padStart(2, "0")}.000Z`),
        () => `id-${tick}`,
      );
      await service.generateInitialMediaForVersion({ exerciseVersionId: versionId });
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "end",
        note: secretNote,
      });
      const regenRows = await storage.all<{ had_note: number }>(
        "SELECT had_note FROM media_regenerations",
      );
      expect(regenRows).toHaveLength(1);
      expect(regenRows[0]?.had_note).toBe(1);
      const tableDump = JSON.stringify(
        await storage.all("SELECT * FROM media_regenerations"),
      );
      expect(tableDump).not.toContain(secretNote);
      const versionDump = JSON.stringify(
        await storage.all("SELECT * FROM exercise_versions"),
      );
      expect(versionDump).not.toContain(secretNote);
      const columnNames = (
        await storage.all<{ name: string }>("PRAGMA table_info(media_regenerations)")
      ).map((row) => row.name);
      expect(columnNames).not.toContain("note");
      expect(columnNames).toContain("had_note");

      for (const call of objectPutSpy.mock.calls) {
        const [key, body] = call;
        expect(String(key)).not.toContain(secretNote);
        expect(new TextDecoder().decode(body)).not.toContain(secretNote);
      }
      for (const call of mediaPutSpy.mock.calls) {
        const [key, body] = call;
        expect(String(key)).not.toContain(secretNote);
        expect(new TextDecoder().decode(body)).not.toContain(secretNote);
      }
      for (const spy of [logSpy, infoSpy, warnSpy, errorSpy]) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call)).not.toContain(secretNote);
        }
      }
    } finally {
      logSpy.mockRestore();
      infoSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
      storage.close();
    }
  });

  it("rejects patient details in the note before calling image generation", async () => {
    const storage = await openMigratedDatabase();
    await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
    const generateStartImage = vi.fn();
    const images: ImageGenerationPort = {
      generateStartAndEndImages: vi.fn(),
      generateStartImage,
      generateEndImage: vi.fn(),
    };
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const { service } = await createService(storage, images);
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
          note: "Patient born 01/15/1990",
        }),
      ).rejects.toSatisfy((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain("01/15/1990");
        return true;
      });
      expect(generateStartImage).not.toHaveBeenCalled();
      const count = await storage.first<{ n: number }>(
        "SELECT COUNT(*) AS n FROM media_regenerations",
      );
      expect(count?.n).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("rejects notes longer than 200 characters", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const generateStartImage = vi.fn();
      const { service } = await createService(storage, {
        generateStartAndEndImages: vi.fn(),
        generateStartImage,
        generateEndImage: vi.fn(),
      });
      const longNote = "x".repeat(201);
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
          note: longNote,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(generateStartImage).not.toHaveBeenCalled();
    } finally {
      storage.close();
    }
  });
});
