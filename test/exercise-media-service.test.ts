import { describe, expect, it, vi } from "vitest";
import type { ImageGenerationPort } from "../src/storage/ports/image-generation.js";
import {
  buildEndImagePrompt,
  buildStartImagePrompt,
  resolveEndPoseDescription,
  selectEndPoseStepFromSteps,
} from "../src/domain/exercise-media-prompts.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { FailingPutMediaStorage } from "./helpers/failing-put-media-storage.js";
import {
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

describe("exercise media prompts (unit)", () => {
  const STYLE_TAIL =
    "Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints.";

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

  it("pins the start prompt unchanged", () => {
    const ctx = { title: "Bridge", startingPosition: "Supine" };
    expect(buildStartImagePrompt(ctx)).toBe(
      `Clinical physiotherapy exercise demonstration: Bridge. Supine. ${STYLE_TAIL} Hold the starting position of the exercise, stable and anatomically neutral.`,
    );
  });

  it("never puts starting-position text in the end prompt", () => {
    const distinctiveStart = "FEET_WIDE_SUMO_START_UNIQUE_D1281";
    const end = buildEndImagePrompt({
      title: "Sumo Squat",
      startingPosition: distinctiveStart,
      steps: "Lower hips\nDrive up to standing",
    });
    expect(end).not.toContain(distinctiveStart);
    expect(end).not.toContain("FEET_WIDE_SUMO");
  });

  it("pins the end-prompt edit wording and movement clause", () => {
    const end = buildEndImagePrompt({
      title: "Sumo Squat",
      startingPosition: "Wide stance",
      steps: "Lower into squat\nThighs parallel to floor",
    });
    expect(end).toContain(
      "Same figure, clothing, camera angle, background and lighting. Change only the pose to the end position: Thighs parallel to floor. Change only the body parts that this exercise moves; keep every other body part exactly as in the start image.",
    );
  });

  it("uses the last non-empty step for end pose when ending_position is absent", () => {
    const end = buildEndImagePrompt({
      title: "Lunge",
      startingPosition: "Standing",
      steps: "Step forward with one leg\nBend both knees\nReturn to start",
    });
    expect(end).toContain("Change only the pose to the end position: Bend both knees.");
  });

  it("prefers ending_position over steps when present", () => {
    const end = buildEndImagePrompt({
      title: "Shoulder press",
      startingPosition: "Seated",
      endingPosition: "Arms extended overhead",
      steps: "Press dumbbells up\nLower with control",
    });
    expect(end).toContain(
      "Change only the pose to the end position: Arms extended overhead.",
    );
    expect(end).not.toContain("Lower with control");
  });

  it("uses ending_position even when it would match an excluded step pattern", () => {
    expect(
      resolveEndPoseDescription({
        title: "Row",
        endingPosition: "Return to start",
        steps: "Pull handle toward ribs",
      }),
    ).toBe("Return to start");
  });

  it("skips whitespace-only gaps and trailing hold lines when picking from steps", () => {
    const end = buildEndImagePrompt({
      title: "Test",
      startingPosition: "Any",
      steps: "Brace core\n  \n\nHold at top\n\n",
    });
    expect(end).toContain("Change only the pose to the end position: Brace core.");
  });

  it("uses the fallback end pose description when steps are empty", () => {
    const end = buildEndImagePrompt({
      title: "Plank",
      startingPosition: "Prone",
      steps: "   \n\t\n",
    });
    expect(end).toContain(
      "Change only the pose to the end position: the end of the exercise movement.",
    );
  });

  it("appends regeneration note only to pose content on end prompts", () => {
    const end = buildEndImagePrompt({
      title: "Bridge",
      steps: "Lift hips",
      regenerationNote: "smaller range",
    });
    expect(end).toContain("Additional guidance from the practitioner: smaller range.");
    expect(end.indexOf("Additional guidance")).toBeGreaterThan(
      end.indexOf("Change only the body parts"),
    );
  });
});

describe("end pose step guard (unit)", () => {
  it("skips a trailing return line when walking steps from the end", () => {
    expect(
      selectEndPoseStepFromSteps(
        "Press weights overhead\nLock elbows softly\nReturn to start",
      ),
    ).toBe("Lock elbows softly");
  });

  it("skips a trailing repeat line when walking steps from the end", () => {
    expect(selectEndPoseStepFromSteps("Lower under control\nRepeat")).toBe(
      "Lower under control",
    );
  });

  it("skips a trailing reps count line when walking steps from the end", () => {
    expect(selectEndPoseStepFromSteps("Squat down deep\n10 reps")).toBe(
      "Squat down deep",
    );
  });

  it("skips several trailing excluded lines and picks the last real movement line", () => {
    expect(
      selectEndPoseStepFromSteps(
        "Hinge at hips\nFlatten back\nHold for 2 seconds\nReturn\nRepeat 10 times",
      ),
    ).toBe("Flatten back");
  });

  it("does not let a mid-list return line override a real last movement line", () => {
    expect(
      selectEndPoseStepFromSteps(
        "Step forward\nReturn to start\nDrive through front heel",
      ),
    ).toBe("Drive through front heel");
  });

  it("uses the fallback when every step line matches exclusion patterns", () => {
    expect(
      resolveEndPoseDescription({ title: "Empty", steps: "Return to start\n10 reps" }),
    ).toBe("the end of the exercise movement");
  });

  it("strips numbering before matching excluded start-position phrasing", () => {
    expect(
      selectEndPoseStepFromSteps(
        "Arms locked overhead\n4. Return to the starting position",
      ),
    ).toBe("Arms locked overhead");
  });

  it("strips bullets before matching lines that begin with return", () => {
    expect(selectEndPoseStepFromSteps("Knee fully extended\n- Return slowly")).toBe(
      "Knee fully extended",
    );
  });

  it("skips back to the start phrasing as a distinct pattern family", () => {
    expect(selectEndPoseStepFromSteps("Lift chest tall\nGo back to the start")).toBe(
      "Lift chest tall",
    );
  });

  it("skips original position phrasing", () => {
    expect(
      selectEndPoseStepFromSteps("Pelvis neutral\nRestore original position"),
    ).toBe("Pelvis neutral");
  });

  it("skips beginning position phrasing", () => {
    expect(
      selectEndPoseStepFromSteps("Tuck chin gently\nMove to beginning position"),
    ).toBe("Tuck chin gently");
  });

  it("skips lines that begin with relax", () => {
    expect(
      selectEndPoseStepFromSteps("Pack shoulder blades\nRelax the shoulders"),
    ).toBe("Pack shoulder blades");
  });

  it("skips perform followed by a number at line start", () => {
    expect(selectEndPoseStepFromSteps("Set hips square\nPerform 12")).toBe(
      "Set hips square",
    );
  });

  it("skips set-count phrasing in the middle of a line", () => {
    expect(selectEndPoseStepFromSteps("Lower to depth\nComplete 3 sets")).toBe(
      "Lower to depth",
    );
  });

  it("skips breathe-only instruction lines", () => {
    expect(selectEndPoseStepFromSteps("Ribs down\nBreathe out")).toBe("Ribs down");
  });

  it("skips hold-only instruction lines", () => {
    expect(selectEndPoseStepFromSteps("Shoulders packed\nHold for 2 seconds")).toBe(
      "Shoulders packed",
    );
  });

  it("skips lines that begin with hold including Hold at top", () => {
    expect(selectEndPoseStepFromSteps("Raise arms overhead\nHold at top")).toBe(
      "Raise arms overhead",
    );
  });

  it("strips numbering and bullets from the chosen end pose text", () => {
    expect(
      resolveEndPoseDescription({
        title: "Squat",
        steps: "1. Stand tall\n2. Lower slowly",
      }),
    ).toBe("Lower slowly");
  });

  it("does not exclude a movement line that uses starting in a non-position sense", () => {
    expect(
      selectEndPoseStepFromSteps(
        "Press up from a starting stance\nReturn to the starting position",
      ),
    ).toBe("Press up from a starting stance");
  });

  it("does not exclude a movement line that begins with restore when not matched as original position", () => {
    expect(selectEndPoseStepFromSteps("Restore scapular control\nRepeat 8 times")).toBe(
      "Restore scapular control",
    );
  });

  it("matches exclusion patterns case-insensitively after numbering trim", () => {
    expect(
      selectEndPoseStepFromSteps("Arms extended\n3) RETURN TO THE STARTING POSITION"),
    ).toBe("Arms extended");
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
  const D1281_END_PROMPT_MARK =
    "Change only the body parts that this exercise moves; keep every other body part exactly as in the start image.";
  const GUARDED_STEPS =
    "Slide heel toward hip\nExtend knee to full range\nReturn to the starting position";
  const GUARDED_END_POSE_SENTENCE =
    "Change only the pose to the end position: Extend knee to full range.";

  async function seedDraftVersion(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    extras?: { steps?: string },
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
        id: FIXTURE_VERSION_ID,
        exercise_id: exerciseId,
        status: "draft",
        title: "Heel slide",
        starting_position: "Supine",
        steps: extras?.steps ?? GUARDED_STEPS,
      }),
    );
    return { practitionerId, exerciseId, versionId: FIXTURE_VERSION_ID };
  }

  it("passes the reworked end prompt on initial generation", async () => {
    const storage = await openMigratedDatabase();
    const generateStartAndEndImages = vi.fn(
      async (input: { startPrompt: string; endPrompt: string }) =>
        new FakeImageGeneration().generateStartAndEndImages(input),
    );
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const { service } = await createService(storage, {
        generateStartAndEndImages,
        generateStartImage: vi.fn(),
        generateEndImage: vi.fn(),
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
      });
      expect(generateStartAndEndImages).toHaveBeenCalledOnce();
      const { endPrompt } = generateStartAndEndImages.mock.calls[0]![0];
      expect(endPrompt).toContain(D1281_END_PROMPT_MARK);
      expect(endPrompt).toContain(GUARDED_END_POSE_SENTENCE);
    } finally {
      storage.close();
    }
  });

  it("passes the reworked end prompt when regenerating both images", async () => {
    const storage = await openMigratedDatabase();
    const generateEndImage = vi.fn(async (endPrompt: string) =>
      new FakeImageGeneration().generateEndImage(endPrompt),
    );
    const generateStartImage = vi.fn(async (startPrompt: string) =>
      new FakeImageGeneration().generateStartImage(startPrompt),
    );
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const { service } = await createService(storage, {
        generateStartAndEndImages: async (input) =>
          new FakeImageGeneration().generateStartAndEndImages(input),
        generateStartImage,
        generateEndImage,
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
      });
      generateEndImage.mockClear();
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "both",
      });
      expect(generateEndImage).toHaveBeenCalledOnce();
      const endPrompt = generateEndImage.mock.calls[0]![0];
      expect(endPrompt).toContain(D1281_END_PROMPT_MARK);
      expect(endPrompt).toContain(GUARDED_END_POSE_SENTENCE);
    } finally {
      storage.close();
    }
  });

  it("passes the reworked end prompt when regenerating end only", async () => {
    const storage = await openMigratedDatabase();
    const generateEndImage = vi.fn(async (endPrompt: string) =>
      new FakeImageGeneration().generateEndImage(endPrompt),
    );
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const { service } = await createService(storage, {
        generateStartAndEndImages: async (input) =>
          new FakeImageGeneration().generateStartAndEndImages(input),
        generateStartImage: vi.fn(),
        generateEndImage,
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
      });
      generateEndImage.mockClear();
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "end",
      });
      expect(generateEndImage).toHaveBeenCalledOnce();
      const endPrompt = generateEndImage.mock.calls[0]![0];
      expect(endPrompt).toContain(D1281_END_PROMPT_MARK);
      expect(endPrompt).toContain(GUARDED_END_POSE_SENTENCE);
    } finally {
      storage.close();
    }
  });

  it("passes guarded end pose text when regenerate falls back to generateStartAndEndImages", async () => {
    const storage = await openMigratedDatabase();
    const generateStartAndEndImages = vi.fn(
      async (input: { startPrompt: string; endPrompt: string }) =>
        new FakeImageGeneration().generateStartAndEndImages(input),
    );
    const generateStartImage = vi.fn(async (startPrompt: string) =>
      new FakeImageGeneration().generateStartImage(startPrompt),
    );
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const { service } = await createService(storage, {
        generateStartAndEndImages,
        generateStartImage,
        generateEndImage: vi.fn(),
      });
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "start",
      });
      expect(generateStartAndEndImages).toHaveBeenCalledOnce();
      const { endPrompt } = generateStartAndEndImages.mock.calls[0]![0];
      expect(endPrompt).toContain(GUARDED_END_POSE_SENTENCE);
    } finally {
      storage.close();
    }
  });

  async function createService(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
    images: ImageGenerationPort = new FakeImageGeneration(),
    media: PrefixMediaStorage = new PrefixMediaStorage(new InMemoryObjectStorage()),
  ) {
    let tick = 0;
    const service = new ExerciseMediaService(
      storage,
      images,
      media,
      () => new Date(`2026-10-30T12:00:${String(tick++).padStart(2, "0")}.000Z`),
      () => testOpaqueEntityId(`media-id-${tick}`),
    );
    return { service, media };
  }

  it("applies migration 0003", async () => {
    const storage = await openMigratedDatabase();
    try {
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
    try {
      const { versionId, practitionerId } = await seedDraftVersion(storage);
      const { service, media } = await createService(storage);
      const created = await service.generateInitialMediaForVersion({
        practitionerId,
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
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const { service } = await createService(storage);
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
      });
      for (let i = 0; i < 4; i += 1) {
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

  it("stores approved regenerations as pending draft without changing live media_set_id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const exerciseId = await seedExercise(storage, practitionerId);
      const approvedVersionId = id("ver-approved-1");
      const liveSetId = id("live-public-set");
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (${Array(22).fill("?").join(", ")})`,
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
      const { service } = await createService(storage);
      const result = await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: approvedVersionId,
        scope: "both",
        note: "deeper range",
      });
      expect(result.outcome).toBe("pending_draft_updated");
      expect(result.media.visibility).toBe("draft");
      expect(result.media.mediaSetId).not.toBe(liveSetId);
      const versionRow = await storage.first<{
        media_set_id: string | null;
        pending_media_set_id: string | null;
      }>(
        "SELECT media_set_id, pending_media_set_id FROM exercise_versions WHERE id = ?",
        [approvedVersionId],
      );
      expect(versionRow?.media_set_id).toBe(liveSetId);
      expect(versionRow?.pending_media_set_id).toBe(result.media.mediaSetId);
      const publicView = await service.getMediaForServing(approvedVersionId, "public");
      expect(publicView?.mediaSetId).toBe(liveSetId);
      const versions = await storage.all<{ version_number: number; status: string }>(
        "SELECT version_number, status FROM exercise_versions WHERE exercise_id = ? ORDER BY version_number",
        [exerciseId],
      );
      expect(versions).toEqual([{ version_number: 1, status: "approved" }]);
    } finally {
      storage.close();
    }
  });

  it("does not persist regeneration note text; records had_note only", async () => {
    const storage = await openMigratedDatabase();
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
        () => testOpaqueEntityId(`media-id-${tick}`),
      );
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
      });
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "end",
        note: secretNote,
      });
      const regenRows = await storage.all<{ had_note: number }>(
        "SELECT had_note FROM media_regenerations",
      );
      expect(regenRows).toHaveLength(2);
      expect(regenRows[0]?.had_note).toBe(0);
      expect(regenRows[1]?.had_note).toBe(1);
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

  it("returns start_reference_unavailable for end-only regeneration without start_provider_url", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const mediaSetId = id("ms-missing-start-url");
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mediaSetId,
          `media-sets/${mediaSetId}/start.png`,
          `media-sets/${mediaSetId}/end.png`,
          null,
          "draft",
          TS,
        ],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        versionId,
      ]);
      const { service } = await createService(storage);
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "end",
        }),
      ).rejects.toMatchObject({ code: "start_reference_unavailable" });
    } finally {
      storage.close();
    }
  });

  async function seedApprovedVersionOwnedByB(
    storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  ) {
    const ownerId = await seedPractitioner(
      storage,
      testOpaqueEntityId("media-svc-owner-b"),
    );
    const exerciseId = await seedExercise(storage, ownerId);
    const approvedVersionId = testOpaqueEntityId("media-svc-b-approved");
    const mediaSetId = testOpaqueEntityId("media-svc-b-approved-set");
    await storage.run(
      `INSERT INTO exercise_versions (
        id, exercise_id, version_number, status, approved_by, approved_at,
        title, description, equipment, starting_position, steps,
        common_mistakes, regressions, progressions, precautions,
        cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
        media_set_id, change_summary, created_at
      ) VALUES (${Array(22).fill("?").join(", ")})`,
      versionInsertBindings({
        id: approvedVersionId,
        exercise_id: exerciseId,
        status: "approved",
        approved_by: ownerId,
        approved_at: TS,
        title: "Published move",
        starting_position: "Supine",
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
      approvedVersionId,
    ]);
    return { ownerId, approvedVersionId };
  }

  it("rejects owner-only internal serve and mutations when practitioner id is missing on an approved version owned by another practitioner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { ownerId, approvedVersionId } = await seedApprovedVersionOwnedByB(storage);
      const { service } = await createService(storage);
      const versionNotFound = {
        code: "version_not_found",
        message: "Exercise version not found",
      };
      await expect(
        service.getMediaForServing(approvedVersionId, "internal", undefined),
      ).rejects.toMatchObject(versionNotFound);
      await expect(
        service.getMediaForServing(approvedVersionId, "internal", ""),
      ).rejects.toMatchObject(versionNotFound);
      await expect(
        service.regenerateMedia({
          practitionerId: "",
          exerciseVersionId: approvedVersionId,
          scope: "start",
        }),
      ).rejects.toMatchObject(versionNotFound);
      await expect(
        service.generateInitialMediaForVersion({
          practitionerId: "",
          exerciseVersionId: approvedVersionId,
        }),
      ).rejects.toMatchObject(versionNotFound);
      const ownerView = await service.getMediaForServing(
        approvedVersionId,
        "internal",
        ownerId,
      );
      expect(ownerView?.mediaSetId).toBeTruthy();
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

  it("does not record a regeneration quota row when draft media save fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const objects = new InMemoryObjectStorage();
      const failingMedia = new FailingPutMediaStorage(objects);
      const service = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        failingMedia,
      );
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).rejects.toThrow("simulated R2 save failure");
      const count = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM media_regenerations WHERE practitioner_id = ?",
        [practitionerId],
      );
      expect(count?.c).toBe(0);
    } finally {
      storage.close();
    }
  });
});
