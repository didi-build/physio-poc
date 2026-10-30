import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { likeContainsPattern } from "../src/domain/sql-like.js";
import {
  TextOverrideValidationError,
  validateTextOverrides,
} from "../src/domain/exercise-text-overrides.js";
import {
  ExerciseLibraryService,
  parseExerciseMutationUndo,
} from "../src/services/exercise-library/exercise-library-service.js";
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
import { addProgramExerciseRow } from "./helpers/exercise-library-program-usage-fixture.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";

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
      id: id(`alias-${exerciseId}-${options.alias}`),
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

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email: "qa@example.com",
      displayName: "QA",
    },
  });
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    auth,
    sessionCookie: auth.createSessionCookieHeader(),
  };
}

describe("Exercise library QA round 2 (integration)", () => {
  it("M06: getExerciseDetails uses practitioner type defaults when exercise has no override", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      await new TypeDefaultsRepository(storage).upsertPractitionerDefaults(
        id("td-1"),
        practId,
        "stretching",
        { reps: 7 },
      );
      await new PractitionerExercisesRepository(storage).upsert({
        practitionerId: practId,
        exerciseId,
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.resolved_params_by_type.stretching?.source).toBe(
        "practitioner_defaults",
      );
      expect(details.resolved_params_by_type.stretching?.params.reps).toBe(7);
    } finally {
      storage.close();
    }
  });

  it("M15 and M16: matched_alias requires title miss and shortest alias wins", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId, {
        title: "Heel slide",
      });
      const aliases = new ExerciseAliasesRepository(storage);
      await aliases.insert({
        id: id("alias-long"),
        exerciseId,
        alias: "LONGALIAS",
        createdAt: TS,
      });
      await aliases.insert({
        id: id("alias-short"),
        exerciseId,
        alias: "SLR",
        createdAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const titleHit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "heel",
      });
      expect(titleHit.exercises[0]?.matched_alias).toBeNull();

      const aliasHit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "slr",
      });
      expect(aliasHit.exercises[0]?.matched_alias).toBe("SLR");
    } finally {
      storage.close();
    }
  });

  it("M17, M21, and M22: default sort is most used from program row counts", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exLow = id("ex-low");
      const exHigh = id("ex-high");
      await seedApproved(storage, practId, {
        exerciseId: exLow,
        title: "AAA low usage",
        approvedAt: "2026-03-01T00:00:00.000Z",
      });
      const { versionId: verHigh } = await seedApproved(storage, practId, {
        exerciseId: exHigh,
        title: "ZZZ high usage",
        approvedAt: "2026-01-01T00:00:00.000Z",
      });

      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId: id("prog-high"),
        rowId: id("row-high"),
        exerciseId: exHigh,
        versionId: verHigh,
        position: 0,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const defaultSort = await service.searchApprovedExercises({
        practitionerId: practId,
      });
      expect(defaultSort.exercises[0]?.exercise_id).toBe(exHigh);

      const newest = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "newest",
      });
      expect(newest.exercises[0]?.exercise_id).toBe(exLow);
    } finally {
      storage.close();
    }
  });

  it("M29, M30, and M31: undo restores overrides, pin, and delete after save", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);

      const { exerciseId: freshId } = await seedApproved(storage, practId, {
        exerciseId: id("ex-fresh"),
        title: "Fresh",
      });
      const firstSave = await service.saveToMyExercises(practId, freshId);
      expect(firstSave.undo.snapshot.had_row).toBe(false);
      await service.applyUndo(practId, freshId, firstSave.undo);
      expect(
        await new PractitionerExercisesRepository(storage).find(practId, freshId),
      ).toBeNull();

      const { exerciseId } = await seedApproved(storage, practId, {
        exerciseId: id("ex-undo"),
        title: "Lib",
      });
      await service.saveToMyExercises(practId, exerciseId);
      await service.updateMyCopy({
        practitionerId: practId,
        exerciseId,
        textOverrides: { title: "Mine" },
      });
      const removed = await service.removeFromMyExercises(practId, exerciseId);
      await service.applyUndo(practId, exerciseId, removed.undo);
      const rowAfterUndoRemove = await new PractitionerExercisesRepository(
        storage,
      ).find(practId, exerciseId);
      expect(rowAfterUndoRemove?.textOverrides.title?.value).toBe("Mine");

      await service.setPinned(practId, exerciseId, true);
      const unpinned = await service.setPinned(practId, exerciseId, false);
      await service.applyUndo(practId, exerciseId, unpinned.undo);
      const pinnedRow = await storage.first<{ favourite: number }>(
        "SELECT favourite FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ?",
        [practId, exerciseId],
      );
      expect(pinnedRow?.favourite).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("M44: pinned section lists favourites that are not new from requests", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyExercises(practId, exerciseId);
      await service.setPinned(practId, exerciseId, true);

      const list = await service.listMyExercises({ practitionerId: practId });
      expect(list.sections.pinned).toHaveLength(1);
      expect(list.sections.pinned[0]?.exercise_id).toBe(exerciseId);
      expect(list.sections.recently_used_and_saved).toHaveLength(0);
    } finally {
      storage.close();
    }
  });

  it("N11: rejects empty base for title and description on validateTextOverrides", () => {
    expect(() =>
      validateTextOverrides({
        title: { value: "My title", base: "" },
      }),
    ).toThrow(TextOverrideValidationError);
    expect(() =>
      validateTextOverrides({
        description: { value: "Short", base: "" },
      }),
    ).toThrow(TextOverrideValidationError);
  });

  it("N17: re-save updates saved_at to server time", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-04-01T10:00:00.000Z",
      });
      await service.saveToMyExercises(practId, exerciseId);
      const first = await new PractitionerExercisesRepository(storage).find(
        practId,
        exerciseId,
      );
      expect(first?.savedAt).toBe("2026-04-01T10:00:00.000Z");

      const later = new ExerciseLibraryService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-05-01T10:00:00.000Z",
      });
      await later.saveToMyExercises(practId, exerciseId);
      const second = await new PractitionerExercisesRepository(storage).find(
        practId,
        exerciseId,
      );
      expect(second?.savedAt).toBe("2026-05-01T10:00:00.000Z");
    } finally {
      storage.close();
    }
  });

  it("N19 and N20: LIKE escapes percent and backslash literally", async () => {
    expect(likeContainsPattern("100%")).toBe("%100\\%%");
    expect(likeContainsPattern("a\\b")).toBe("%a\\\\b%");

    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: id("ex-percent"),
        title: "100% effort",
      });
      await seedApproved(storage, practId, {
        exerciseId: id("ex-other"),
        title: "100X effort",
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const hit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "100%",
      });
      expect(hit.exercises).toHaveLength(1);
      expect(hit.exercises[0]?.exercise_id).toBe(id("ex-percent"));
    } finally {
      storage.close();
    }
  });

  it("N23 and N27: My exercises body region filter excludes non-matching saved rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: id("ex-knee"),
        title: "Knee move",
        bodyRegionId: "br-knee",
      });
      await seedApproved(storage, practId, {
        exerciseId: id("ex-hip"),
        title: "Hip move",
        bodyRegionId: "br-hip",
      });
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: id("ex-knee"),
        savedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: id("ex-hip"),
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const list = await service.listMyExercises({
        practitionerId: practId,
        bodyRegion: "knee",
      });
      expect(list.list_state).toBe("ok");
      const allItems = [
        ...list.sections.new_from_requests,
        ...list.sections.pinned,
        ...list.sections.recently_used_and_saved,
      ];
      expect(allItems).toHaveLength(1);
      expect(allItems[0]?.exercise_id).toBe(id("ex-knee"));
    } finally {
      storage.close();
    }
  });

  it("uses practitioner subquery for My exercises search with many library rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      for (let i = 0; i < 12; i += 1) {
        await seedApproved(storage, practId, {
          exerciseId: `ex-lib-${i}`,
          title: `Library item ${i}`,
        });
      }
      await seedApproved(storage, practId, {
        exerciseId: id("ex-saved"),
        title: "Saved unique title",
      });
      await new PractitionerExercisesRepository(storage).upsert({
        practitionerId: practId,
        exerciseId: id("ex-saved"),
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const list = await service.listMyExercises({
        practitionerId: practId,
        query: "Saved unique",
      });
      expect(list.list_state).toBe("ok");
      expect(list.sections.recently_used_and_saved).toHaveLength(1);
    } finally {
      storage.close();
    }
  });

  it("PATCH sets base from library via buildTextOverrideEntry", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId, {
        title: "Lib title",
      });
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyExercises(practId, exerciseId);

      await service.updateMyCopy({
        practitionerId: practId,
        exerciseId,
        textOverrides: { title: "Mine" },
      });
      const details = await service.getExerciseDetails(practId, exerciseId);
      const titleField = details.resolved_text.find((field) => field.key === "title");
      expect(titleField?.library_updated).toBe(false);

      await service.updateMyCopy({
        practitionerId: practId,
        exerciseId,
        textOverrides: { title: "Mine v2" },
      });
      const row = await new PractitionerExercisesRepository(storage).find(
        practId,
        exerciseId,
      );
      expect(row?.textOverrides.title?.value).toBe("Mine v2");
      expect(row?.textOverrides.title?.base).toBe("Lib title");
    } finally {
      storage.close();
    }
  });

  it("strict undo snapshot validation returns 400 for malformed payloads", async () => {
    expect(() => parseExerciseMutationUndo(undefined)).toThrow();
    expect(() =>
      parseExerciseMutationUndo({
        practitioner_id: "p",
        exercise_id: "e",
        snapshot: {
          had_row: "yes",
          favourite: false,
          saved_at: null,
          last_used_at: null,
          text_overrides_json: "{}",
          param_overrides_json: "{}",
        },
      }),
    ).toThrow();

    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const { sessionCookie, ...deps } = apiDeps(storage, practId);
      const base = `https://example.test/api/practitioners/${practId}/my-exercises/${exerciseId}`;

      const missingSnapshot = await handleRequest(
        new Request(base, {
          method: "POST",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          body: JSON.stringify({ action: "undo", undo: { practitioner_id: practId } }),
        }),
        deps,
      );
      expect(missingSnapshot.status).toBe(400);

      const badJson = await handleRequest(
        new Request(base, {
          method: "POST",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          body: JSON.stringify({
            action: "undo",
            undo: {
              practitioner_id: practId,
              exercise_id: exerciseId,
              snapshot: {
                had_row: true,
                favourite: false,
                saved_at: TS,
                last_used_at: null,
                text_overrides_json: "{}",
                param_overrides_json: "{not-json",
              },
            },
          }),
        }),
        deps,
      );
      expect(badJson.status).toBe(400);

      const looseDate = await handleRequest(
        new Request(base, {
          method: "POST",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          body: JSON.stringify({
            action: "undo",
            undo: {
              practitioner_id: practId,
              exercise_id: exerciseId,
              snapshot: {
                had_row: true,
                favourite: false,
                saved_at: "2026-01-01T",
                last_used_at: null,
                text_overrides_json: "{}",
                param_overrides_json: "{}",
              },
            },
          }),
        }),
        deps,
      );
      expect(looseDate.status).toBe(400);

      await new PractitionerExercisesRepository(storage).upsert({
        practitionerId: practId,
        exerciseId,
        savedAt: TS,
      });
      const badParams = await handleRequest(
        new Request(base, {
          method: "POST",
          headers: { cookie: sessionCookie, "content-type": "application/json" },
          body: JSON.stringify({
            action: "undo",
            undo: {
              practitioner_id: practId,
              exercise_id: exerciseId,
              snapshot: {
                had_row: true,
                favourite: false,
                saved_at: TS,
                last_used_at: null,
                text_overrides_json: "{}",
                param_overrides_json: JSON.stringify({ isometric: { hold_s: 10 } }),
              },
            },
          }),
        }),
        deps,
      );
      expect(badParams.status).toBe(400);
    } finally {
      storage.close();
    }
  });
});
