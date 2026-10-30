import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { likeContainsPattern } from "../src/domain/sql-like.js";
import {
  buildTextOverrideEntry,
  TextOverrideLegacyShapeError,
  validateTextOverrides,
} from "../src/domain/exercise-text-overrides.js";
import { ExerciseLibraryService } from "../src/services/exercise-library/exercise-library-service.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { ExerciseAliasesRepository } from "../src/storage/repositories/exercise-data.js";
import { ExerciseBodyRegionsRepository } from "../src/storage/repositories/exercise-data.js";
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";

async function seedApproved(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
  options: {
    exerciseId?: string;
    versionId?: string;
    title?: string;
    approvedAt?: string;
    alias?: string;
    bodyRegionId?: string;
  } = {},
) {
  const exerciseId = options.exerciseId ?? id("ex-1");
  const versionId = options.versionId ?? id(`ver-${exerciseId}`);
  await seedExercise(storage, practId, exerciseId);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: versionId,
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practId,
      approved_at: options.approvedAt ?? TS,
      title: options.title ?? "Heel slide",
      cue_stretching: "Hold the stretch",
    }),
  ]);
  if (options.alias) {
    const aliases = new ExerciseAliasesRepository(storage);
    await aliases.insert({
      id: id(`alias-${exerciseId}`),
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

function apiDeps(storage: Awaited<ReturnType<typeof openMigratedDatabase>>) {
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    enableUnauthenticatedApi: true as const,
  };
}

describe("Exercise library QA round 1 (integration)", () => {
  it("excludes draft-only exercises that match the query and returns not found for details", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: "ex-approved",
        title: "Other",
      });
      await seedExercise(storage, practId, "ex-draft-only");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-draft-only",
          exercise_id: "ex-draft-only",
          title: "Unique draft title",
        }),
      ]);

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const search = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "Unique draft title",
      });
      expect(search.exercises).toHaveLength(0);

      await expect(
        service.getExerciseDetails(practId, "ex-draft-only"),
      ).rejects.toMatchObject({ code: "exercise_not_found" });
    } finally {
      storage.close();
    }
  });

  it("uses latest approved version when a newer draft exists on the same exercise", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId, {
        exerciseId: "ex-both",
        title: "Approved title",
      });
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-draft-newer",
          exercise_id: exerciseId,
          version_number: 2,
          title: "Draft only title",
        }),
      ]);

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const search = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "Draft only title",
      });
      expect(search.exercises).toHaveLength(0);

      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.library.title).toBe("Approved title");
      expect(details.version_number).toBe(1);

      await service.saveToMyExercises(practId, exerciseId);
      const list = await service.listMyExercises({ practitionerId: practId });
      const item =
        list.sections.recently_used_and_saved[0] ??
        list.sections.pinned[0] ??
        list.sections.new_from_requests[0];
      expect(item?.exercise_name).toBe("Approved title");
    } finally {
      storage.close();
    }
  });

  it("sorts approved search by most used, newest, and A to Z", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const pract2 = await seedPractitioner(storage, "pract-2", "coach2@example.com");
      const exAaa = id("ex-aaa");
      const exZzz = id("ex-zzz");
      await seedApproved(storage, practId, {
        exerciseId: exAaa,
        title: "AAA move",
        approvedAt: "2026-01-01T00:00:00.000Z",
      });
      await seedApproved(storage, practId, {
        exerciseId: exZzz,
        title: "ZZZ move",
        approvedAt: "2026-02-01T00:00:00.000Z",
      });

      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: exAaa,
        savedAt: TS,
        lastUsedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: pract2,
        exerciseId: exAaa,
        savedAt: TS,
        lastUsedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: exZzz,
        savedAt: TS,
        lastUsedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const mostUsed = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(mostUsed.exercises.map((row) => row.exercise_id)).toEqual([exAaa, exZzz]);

      const newest = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "newest",
      });
      expect(newest.exercises[0]?.exercise_id).toBe(exZzz);

      const alpha = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "a_to_z",
      });
      expect(alpha.exercises.map((row) => row.exercise_name)).toEqual([
        "AAA move",
        "ZZZ move",
      ]);
    } finally {
      storage.close();
    }
  });

  it("filters approved search by body region without returning out-of-region exercises", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: "ex-knee",
        title: "Knee move",
        bodyRegionId: "br-knee",
      });
      await seedApproved(storage, practId, {
        exerciseId: "ex-hip",
        title: "Hip move",
        bodyRegionId: "br-hip",
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const hit = await service.searchApprovedExercises({
        practitionerId: practId,
        bodyRegion: "knee",
      });
      expect(hit.exercises).toHaveLength(1);
      expect(hit.exercises[0]?.exercise_name).toBe("Knee move");
    } finally {
      storage.close();
    }
  });

  it("sets matched_alias only when the title does not match the query", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        title: "Heel slide",
        alias: "SLR",
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const aliasHit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "slr",
      });
      expect(aliasHit.exercises[0]?.matched_alias).toBe("SLR");

      const titleHit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "heel",
      });
      expect(titleHit.exercises[0]?.matched_alias).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("detects library updated from base comparison and resolves param precedence", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId, {
        title: "Heel slide",
      });
      const typeDefaults = new TypeDefaultsRepository(storage);
      await typeDefaults.upsertPractitionerDefaults(id("td-1"), practId, "stretching", {
        reps: 5,
      });

      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId,
        savedAt: TS,
        textOverrides: {
          title: { value: "Custom", base: "Heel slide" },
        },
        paramOverrides: { stretching: { reps: 10 } },
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      const titleField = details.resolved_text.find((field) => field.key === "title");
      expect(titleField?.library_updated).toBe(false);
      expect(details.resolved_params_by_type.stretching?.params.reps).toBe(10);
      expect(details.resolved_params_by_type.stretching?.source).toBe(
        "exercise_override",
      );

      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-2",
          exercise_id: exerciseId,
          version_number: 2,
          status: "approved",
          approved_by: practId,
          approved_at: "2026-03-01T00:00:00.000Z",
          title: "Heel slide v2",
          cue_stretching: "Hold the stretch",
        }),
      ]);

      const afterLibUpdate = await service.getExerciseDetails(practId, exerciseId);
      const updatedTitle = afterLibUpdate.resolved_text.find(
        (field) => field.key === "title",
      );
      expect(updatedTitle?.library_updated).toBe(true);

      const list = await service.listMyExercises({ practitionerId: practId });
      const item = list.sections.recently_used_and_saved[0];
      expect(item?.library_updated).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("binds undo to the URL and rejects tampered snapshots", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const otherPract = await seedPractitioner(
        storage,
        "pract-other",
        "other@example.com",
      );
      const { exerciseId } = await seedApproved(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);

      const saved = await service.saveToMyExercises(practId, exerciseId);
      await expect(
        service.applyUndo(otherPract, exerciseId, saved.undo),
      ).rejects.toMatchObject({ code: "undo_mismatch" });

      const tampered = {
        ...saved.undo,
        exercise_id: "ex-other",
      };
      await expect(
        service.applyUndo(practId, exerciseId, tampered),
      ).rejects.toMatchObject({ code: "undo_mismatch" });

      const removed = await service.removeFromMyExercises(practId, exerciseId);
      await service.applyUndo(practId, exerciseId, removed.undo);
      const list = await service.listMyExercises({ practitionerId: practId });
      expect(
        list.sections.recently_used_and_saved.length +
          list.sections.pinned.length +
          list.sections.new_from_requests.length,
      ).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("rejects undo restore for draft-only exercises and invalid timestamps", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedExercise(storage, practId, "ex-draft");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-draft",
          exercise_id: "ex-draft",
        }),
      ]);

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const snapshot = {
        practitioner_id: practId,
        exercise_id: "ex-draft",
        snapshot: {
          had_row: true,
          favourite: false,
          saved_at: TS,
          last_used_at: null,
          text_overrides_json: "{}",
          param_overrides_json: "{}",
        },
      };
      await expect(
        service.applyUndo(practId, "ex-draft", snapshot),
      ).rejects.toMatchObject({ code: "exercise_not_found" });

      const badTime = {
        ...snapshot,
        exercise_id: "ex-1",
        snapshot: { ...snapshot.snapshot, saved_at: "not-a-date" },
      };
      await seedApproved(storage, practId, { exerciseId: "ex-1" });
      await expect(service.applyUndo(practId, "ex-1", badTime)).rejects.toMatchObject({
        code: "invalid_input",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects isometric param overrides on stretch exercises", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId,
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await expect(
        service.updateMyCopy({
          practitionerId: practId,
          exerciseId,
          paramOverrides: { isometric: { hold_s: 30 } },
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("searches My exercises with list_state codes and matched aliases", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exA = id("ex-a");
      const exB = id("ex-b");
      await seedApproved(storage, practId, {
        exerciseId: exA,
        title: "Alpha stretch",
        alias: "ZZTOP",
      });
      await seedApproved(storage, practId, {
        exerciseId: exB,
        title: "Beta stretch",
      });
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: exA,
        savedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: exB,
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const noMatch = await service.listMyExercises({
        practitionerId: practId,
        query: "missing",
      });
      expect(noMatch.list_state).toBe("nothing_in_my_exercises_matches");
      expect(noMatch.search_query).toBe("missing");

      const categoryMiss = await service.listMyExercises({
        practitionerId: practId,
        category: "Strengthening",
      });
      expect(categoryMiss.list_state).toBe("no_saved_exercises_with_filters");

      const aliasHit = await service.listMyExercises({
        practitionerId: practId,
        query: "zztop",
      });
      expect(aliasHit.list_state).toBe("ok");
      expect(aliasHit.sections.recently_used_and_saved[0]?.matched_alias).toBe("ZZTOP");
    } finally {
      storage.close();
    }
  });

  it("uses server time on save, keep mine, pin, sections, and in_my_exercises", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId, {
        title: "Lib title",
      });
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-06-01T10:00:00.000Z",
      });

      const saved = await service.saveToMyExercises(practId, exerciseId);
      const row = await new PractitionerExercisesRepository(storage).find(
        practId,
        exerciseId,
      );
      expect(row?.savedAt).toBe("2026-06-01T10:00:00.000Z");

      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.in_my_exercises).toBe(true);

      await service.updateMyCopy({
        practitionerId: practId,
        exerciseId,
        textOverrides: {
          title: "Mine",
        },
      });

      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-lib-2",
          exercise_id: exerciseId,
          version_number: 2,
          status: "approved",
          approved_by: practId,
          approved_at: "2026-07-01T00:00:00.000Z",
          title: "Lib title v2",
          cue_stretching: "Hold the stretch",
        }),
      ]);

      await service.updateMyCopy({
        practitionerId: practId,
        exerciseId,
        keepMine: ["title"],
      });
      const afterKeep = await new PractitionerExercisesRepository(storage).find(
        practId,
        exerciseId,
      );
      expect(afterKeep?.textOverrides.title?.base).toBe("Lib title v2");
      expect(afterKeep?.textOverrides.title?.value).toBe("Mine");

      await service.setPinned(practId, exerciseId, true);
      const pinnedRow = await storage.first<{ favourite: number }>(
        "SELECT favourite FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ?",
        [practId, exerciseId],
      );
      expect(pinnedRow?.favourite).toBe(1);

      await storage.run(
        `INSERT INTO exercise_requests (id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "req-1",
          "Requested",
          null,
          practId,
          "approved",
          exerciseId,
          TS,
          "2026-08-01T00:00:00.000Z",
        ],
      );
      const list = await service.listMyExercises({ practitionerId: practId });
      expect(list.sections.new_from_requests).toHaveLength(1);
      expect(list.sections.pinned).toHaveLength(0);

      void saved;
    } finally {
      storage.close();
    }
  });

  it("returns text_overrides_invalid_shape for legacy stored JSON on details", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      await storage.run(
        `INSERT INTO practitioner_exercises (
          practitioner_id, exercise_id, favourite, saved_at, last_used_at,
          text_overrides_json, param_overrides_json
        ) VALUES (?, ?, 0, ?, NULL, ?, '{}')`,
        [practId, exerciseId, TS, JSON.stringify({ title: "plain string" })],
      );

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await expect(
        service.getExerciseDetails(practId, exerciseId),
      ).rejects.toMatchObject({ code: "text_overrides_invalid_shape" });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid override values when editing my copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyExercises(practId, exerciseId);

      expect(() => buildTextOverrideEntry("title", "a".repeat(81), "Lib")).toThrow();

      await expect(
        service.updateMyCopy({
          practitionerId: practId,
          exerciseId,
          textOverrides: {
            title: "a".repeat(81),
          },
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("treats underscore literally in LIKE search", async () => {
    expect(likeContainsPattern("a_b")).toBe("%a\\_b%");
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: "ex-under",
        title: "move_a_b",
      });
      await seedApproved(storage, practId, {
        exerciseId: "ex-plain",
        title: "moveaxb",
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const hit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "move_a_b",
      });
      expect(hit.exercises).toHaveLength(1);
      expect(hit.exercises[0]?.exercise_id).toBe("ex-under");
    } finally {
      storage.close();
    }
  });

  it("handles exercise library HTTP routes when unauthenticated API is enabled", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const deps = apiDeps(storage);
      const base = `https://example.test/api/practitioners/${practId}`;

      const badSort = await handleRequest(
        new Request(`${base}/exercises/approved/search?sort=bad`),
        deps,
      );
      expect(badSort.status).toBe(400);

      const badType = await handleRequest(
        new Request(`${base}/exercises/approved/search?prescription_type=nope`),
        deps,
      );
      expect(badType.status).toBe(400);

      const save = await handleRequest(
        new Request(`${base}/my-exercises/${exerciseId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "save",
            saved_at: "2020-01-01T00:00:00.000Z",
          }),
        }),
        deps,
      );
      expect(save.status).toBe(200);
      const row = await new PractitionerExercisesRepository(storage).find(
        practId,
        exerciseId,
      );
      expect(row?.savedAt).not.toBe("2020-01-01T00:00:00.000Z");

      const patch = await handleRequest(
        new Request(`${base}/my-exercises/${exerciseId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text_overrides: {
              title: "Edited",
            },
          }),
        }),
        deps,
      );
      expect(patch.status).toBe(200);

      const objectPatch = await handleRequest(
        new Request(`${base}/my-exercises/${exerciseId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text_overrides: {
              title: { value: "Edited", base: "wrong" },
            },
          }),
        }),
        deps,
      );
      expect(objectPatch.status).toBe(400);

      const undoMismatch = await handleRequest(
        new Request(`${base}/my-exercises/${exerciseId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "undo",
            undo: {
              practitioner_id: "other",
              exercise_id: exerciseId,
              snapshot: {
                had_row: false,
                favourite: false,
                saved_at: null,
                last_used_at: null,
                text_overrides_json: "{}",
                param_overrides_json: "{}",
              },
            },
          }),
        }),
        deps,
      );
      expect(undoMismatch.status).toBe(400);
      await expect(undoMismatch.json()).resolves.toMatchObject({
        error: "undo_mismatch",
      });
    } finally {
      storage.close();
    }
  });

  it("maps legacy shape errors from validateTextOverrides", () => {
    expect(() => validateTextOverrides({ title: "legacy" } as never)).toThrow(
      TextOverrideLegacyShapeError,
    );
  });
});
