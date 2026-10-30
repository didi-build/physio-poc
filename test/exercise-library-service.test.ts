import { describe, expect, it } from "vitest";
import { ExerciseLibraryService } from "../src/services/exercise-library/exercise-library-service.js";
import { buildWebAppExerciseSearchUrl } from "../src/mcp-connector/urls.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { ExerciseAliasesRepository } from "../src/storage/repositories/exercise-data.js";
import { ExerciseBodyRegionsRepository } from "../src/storage/repositories/exercise-data.js";
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
import { buildTextOverrideEntry } from "../src/domain/exercise-text-overrides.js";

async function seedApprovedStretch(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  options: {
    exerciseId?: string;
    versionId?: string;
    title?: string;
    alias?: string;
    bodyRegionId?: string;
  } = {},
) {
  const exerciseId = options.exerciseId ?? "ex-stretch-1";
  const versionId = options.versionId ?? "ver-stretch-1";
  await seedExercise(storage, practitionerId, exerciseId);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: versionId,
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title: options.title ?? "Heel slide",
      cue_stretching: "Hold the stretch",
    }),
  ]);
  if (options.alias) {
    const aliases = new ExerciseAliasesRepository(storage);
    await aliases.insert({
      id: "alias-1",
      exerciseId,
      alias: options.alias,
      createdAt: TS,
    });
  }
  if (options.bodyRegionId) {
    const links = new ExerciseBodyRegionsRepository(storage);
    await links.link(exerciseId, options.bodyRegionId);
  }
  return { exerciseId, versionId };
}

describe("ExerciseLibraryService (integration, SQLite)", () => {
  it("returns only approved exercises and excludes draft-only rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApprovedStretch(storage, practId, { title: "Approved move" });
      await seedExercise(storage, practId, "ex-draft-only");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-draft-only",
          exercise_id: "ex-draft-only",
        }),
      ]);

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const result = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "Approved",
      });
      expect(result.exercises).toHaveLength(1);
      expect(result.exercises[0]?.exercise_name).toBe("Approved move");
    } finally {
      storage.close();
    }
  });

  it("matches alias and body region filters with matched alias metadata", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApprovedStretch(storage, practId, {
        title: "Straight leg raise",
        alias: "SLR",
        bodyRegionId: "br-knee",
      });
      await seedExercise(storage, practId, "ex-strength");
      await storage.run("UPDATE exercises SET category = ? WHERE id = ?", [
        "strengthening",
        "ex-strength",
      ]);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-strength-1",
          exercise_id: "ex-strength",
          status: "approved",
          approved_by: practId,
          approved_at: TS,
          title: "Wall sit",
        }),
      ]);

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const aliasHit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "slr",
      });
      expect(aliasHit.exercises[0]?.matched_alias).toBe("SLR");

      const regionHit = await service.searchApprovedExercises({
        practitionerId: practId,
        bodyRegion: "knee",
      });
      expect(
        regionHit.exercises.some((row) => row.exercise_name === "Straight leg raise"),
      ).toBe(true);

      const categoryHit = await service.searchApprovedExercises({
        practitionerId: practId,
        category: "Strengthening",
      });
      expect(categoryHit.exercises).toHaveLength(1);
      expect(categoryHit.exercises[0]?.category).toBe("Strengthening");
    } finally {
      storage.close();
    }
  });

  it("returns prefilled search_link when no approved exercises match", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const result = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "missing exercise name",
      });
      expect(result.exercises).toHaveLength(0);
      expect(result.search_link).toBe(
        buildWebAppExerciseSearchUrl(
          MCP_TEST_CONFIG.webAppBaseUrl,
          "missing exercise name",
        ),
      );
    } finally {
      storage.close();
    }
  });

  it("flags library updated text fields after a new library version changes overridden text", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApprovedStretch(storage, practId, {
        title: "Heel slide",
      });
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId,
        savedAt: TS,
        textOverrides: {
          title: buildTextOverrideEntry("title", "My heel slide", "Heel slide"),
        },
      });

      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-stretch-2",
          exercise_id: exerciseId,
          version_number: 2,
          status: "approved",
          approved_by: practId,
          approved_at: "2026-02-01T00:00:00.000Z",
          title: "Heel slide updated",
          cue_stretching: "Hold the stretch",
        }),
      ]);

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      const titleField = details.resolved_text.find((field) => field.key === "title");
      expect(titleField?.resolved).toBe("My heel slide");
      expect(titleField?.library_updated).toBe(true);

      const cleared = await service.updateMyCopy({
        practitionerId: practId,
        exerciseId,
        useLibraryVersion: ["title"],
      });
      expect(cleared.undo.snapshot.had_row).toBe(true);
      const after = await service.getExerciseDetails(practId, exerciseId);
      expect(
        after.resolved_text.find((field) => field.key === "title")?.library_updated,
      ).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("supports save, remove, and undo for My exercises", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApprovedStretch(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);

      const saved = await service.saveToMyExercises(practId, exerciseId);
      const listAfterSave = await service.listMyExercises({ practitionerId: practId });
      const totalSaved =
        listAfterSave.sections.new_from_requests.length +
        listAfterSave.sections.pinned.length +
        listAfterSave.sections.recently_used_and_saved.length;
      expect(totalSaved).toBe(1);

      const removed = await service.removeFromMyExercises(practId, exerciseId);
      const listAfterRemove = await service.listMyExercises({
        practitionerId: practId,
      });
      expect(
        listAfterRemove.sections.new_from_requests.length +
          listAfterRemove.sections.pinned.length +
          listAfterRemove.sections.recently_used_and_saved.length,
      ).toBe(0);

      await service.applyUndo(practId, exerciseId, removed.undo);
      const listAfterUndo = await service.listMyExercises({ practitionerId: practId });
      expect(
        listAfterUndo.sections.new_from_requests.length +
          listAfterUndo.sections.pinned.length +
          listAfterUndo.sections.recently_used_and_saved.length,
      ).toBe(1);

      void saved;
    } finally {
      storage.close();
    }
  });
});

describe("resolveTextField (unit)", () => {
  it("returns override value from entry objects", async () => {
    const { resolveTextField } =
      await import("../src/domain/exercise-text-overrides.js");
    expect(
      resolveTextField(
        { title: { value: "My title", base: "Library title" } },
        {
          title: "Library title",
          description: "",
          cue_stretching: null,
          cue_isometric: null,
          cue_concentric: null,
          cue_eccentric: null,
        },
        "title",
        "stretching",
      ),
    ).toBe("My title");
  });
});
