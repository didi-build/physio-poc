import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import {
  TextOverrideValidationError,
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
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";

async function seedApproved(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
  options: {
    exerciseId?: string;
    versionId?: string;
    title?: string;
    category?: "stretch" | "strengthening";
    alias?: string;
  } = {},
) {
  const exerciseId = options.exerciseId ?? id("ex-1");
  const versionId = options.versionId ?? id(`ver-${exerciseId}`);
  await seedExercise(storage, practId, exerciseId);
  if (options.category && options.category !== "stretch") {
    await storage.run("UPDATE exercises SET category = ? WHERE id = ?", [
      options.category,
      exerciseId,
    ]);
  }
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: versionId,
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practId,
      approved_at: TS,
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

function undoPost(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
  exerciseId: string,
  undoBody: unknown,
) {
  const deps = apiDeps(storage);
  return handleRequest(
    new Request(
      `https://example.test/api/practitioners/${practId}/my-exercises/${exerciseId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "undo", undo: undoBody }),
      },
    ),
    deps,
  );
}

describe("Exercise library QA round 3 (tests only)", () => {
  it("M15: matched_alias when the title also matches the query", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId, {
        title: "SLR stretch",
      });
      const aliases = new ExerciseAliasesRepository(storage);
      await aliases.insert({
        id: id("alias-slr"),
        exerciseId,
        alias: "SLR",
        createdAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const hit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "slr",
      });
      expect(hit.exercises).toHaveLength(1);
      expect(hit.exercises[0]?.matched_alias).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("M16: the shortest alias wins when the title does not match", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId, {
        title: "Heel slide",
      });
      const aliases = new ExerciseAliasesRepository(storage);
      await aliases.insert({
        id: id("alias-slr-raise"),
        exerciseId,
        alias: "SLR raise",
        createdAt: TS,
      });
      await aliases.insert({
        id: id("alias-slr"),
        exerciseId,
        alias: "SLR",
        createdAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const hit = await service.searchApprovedExercises({
        practitionerId: practId,
        query: "slr",
      });
      expect(hit.exercises[0]?.matched_alias).toBe("SLR");
    } finally {
      storage.close();
    }
  });

  it("N05: undo with a loose last_used_at returns 400", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const response = await undoPost(storage, practId, exerciseId, {
        practitioner_id: practId,
        exercise_id: exerciseId,
        snapshot: {
          had_row: true,
          favourite: false,
          saved_at: TS,
          last_used_at: "2026-01-01",
          text_overrides_json: "{}",
          param_overrides_json: "{}",
        },
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "invalid_input",
      });
    } finally {
      storage.close();
    }
  });

  it("N11: empty base for title or description is rejected", () => {
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

  it("N22: My exercises category filter applies to listed rows, not only the count", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: "ex-stretch",
        title: "Alpha Shared token stretch",
        category: "stretch",
      });
      await seedApproved(storage, practId, {
        exerciseId: "ex-strength",
        title: "Zulu Shared token strength",
        category: "strengthening",
      });
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: "ex-stretch",
        savedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: "ex-strength",
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const list = await service.listMyExercises({
        practitionerId: practId,
        query: "Shared token",
        category: "Strengthening",
      });
      expect(list.list_state).toBe("ok");
      const items = [
        ...list.sections.new_from_requests,
        ...list.sections.pinned,
        ...list.sections.recently_used_and_saved,
      ];
      expect(items).toHaveLength(1);
      expect(items[0]?.exercise_id).toBe("ex-strength");
      expect(items[0]?.category).toBe("Strengthening");
      expect(items.some((item) => item.exercise_id === "ex-stretch")).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("N24: My exercises search ignores matching library exercises that are not saved", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: "ex-saved",
        title: "Zulu Saved needle saved",
      });
      await seedApproved(storage, practId, {
        exerciseId: "ex-unsaved",
        title: "Alpha Saved needle library only",
      });
      await new PractitionerExercisesRepository(storage).upsert({
        practitionerId: practId,
        exerciseId: "ex-saved",
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const list = await service.listMyExercises({
        practitionerId: practId,
        query: "Saved needle",
      });
      expect(list.list_state).toBe("ok");
      const items = [
        ...list.sections.new_from_requests,
        ...list.sections.pinned,
        ...list.sections.recently_used_and_saved,
      ];
      expect(items).toHaveLength(1);
      expect(items[0]?.exercise_id).toBe("ex-saved");
      expect(items.some((item) => item.exercise_id === "ex-unsaved")).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("N24c: My exercises search is scoped to this practitioner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const otherId = await seedPractitioner(storage, "pract-2", "other@example.com");
      await seedApproved(storage, practId, {
        exerciseId: "ex-unrelated",
        title: "Unrelated saved move",
      });
      await seedApproved(storage, practId, {
        exerciseId: "ex-match",
        title: "Practitioner scope token",
      });
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: "ex-unrelated",
        savedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: otherId,
        exerciseId: "ex-match",
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const noMatchForPractitioner = await service.listMyExercises({
        practitionerId: practId,
        query: "Practitioner scope",
      });
      expect(noMatchForPractitioner.list_state).toBe("nothing_in_my_exercises_matches");
      const emptyItems = [
        ...noMatchForPractitioner.sections.new_from_requests,
        ...noMatchForPractitioner.sections.pinned,
        ...noMatchForPractitioner.sections.recently_used_and_saved,
      ];
      expect(emptyItems).toHaveLength(0);
      expect(emptyItems.some((item) => item.exercise_id === "ex-match")).toBe(false);

      await seedApproved(storage, practId, {
        exerciseId: "ex-alpha",
        title: "Scope token alpha",
      });
      await seedApproved(storage, practId, {
        exerciseId: "ex-z",
        title: "Scope token zulu",
      });
      await myRepo.upsert({
        practitionerId: otherId,
        exerciseId: "ex-alpha",
        savedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: "ex-z",
        savedAt: TS,
      });

      const scopedList = await service.listMyExercises({
        practitionerId: practId,
        query: "Scope token",
      });
      expect(scopedList.list_state).toBe("ok");
      const scopedItems = [
        ...scopedList.sections.new_from_requests,
        ...scopedList.sections.pinned,
        ...scopedList.sections.recently_used_and_saved,
      ];
      expect(scopedItems.map((item) => item.exercise_id)).toEqual(["ex-z"]);
    } finally {
      storage.close();
    }
  });

  it("N24d: My exercises search returns every saved match", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedApproved(storage, practId, {
        exerciseId: "ex-a",
        title: "Pair query alpha",
      });
      await seedApproved(storage, practId, {
        exerciseId: "ex-b",
        title: "Pair query beta",
      });
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: "ex-a",
        savedAt: TS,
      });
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId: "ex-b",
        savedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const list = await service.listMyExercises({
        practitionerId: practId,
        query: "Pair query",
      });
      expect(list.list_state).toBe("ok");
      const ids = [
        ...list.sections.new_from_requests,
        ...list.sections.pinned,
        ...list.sections.recently_used_and_saved,
      ].map((item) => item.exercise_id);
      expect(ids.sort()).toEqual(["ex-a", "ex-b"]);
    } finally {
      storage.close();
    }
  });

  it("N35: undo with a non-boolean favourite returns 400", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const response = await undoPost(storage, practId, exerciseId, {
        practitioner_id: practId,
        exercise_id: exerciseId,
        snapshot: {
          had_row: true,
          favourite: 1,
          saved_at: TS,
          last_used_at: null,
          text_overrides_json: "{}",
          param_overrides_json: "{}",
        },
      });
      expect(response.status).toBe(400);
    } finally {
      storage.close();
    }
  });

  it("N36: undo with no snapshot object returns 400", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const { exerciseId } = await seedApproved(storage, practId);
      const response = await undoPost(storage, practId, exerciseId, {
        practitioner_id: practId,
        exercise_id: exerciseId,
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "invalid_input",
      });
    } finally {
      storage.close();
    }
  });
});
