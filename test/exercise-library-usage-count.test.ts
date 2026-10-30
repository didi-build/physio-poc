import { describe, expect, it } from "vitest";
import { ExerciseLibraryService } from "../src/services/exercise-library/exercise-library-service.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { addProgramExerciseRow } from "./helpers/exercise-library-program-usage-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

async function seedApprovedExercise(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  options: { exerciseId: string; versionId: string; title: string },
) {
  await seedExercise(storage, practitionerId, options.exerciseId);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: options.versionId,
      exercise_id: options.exerciseId,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title: options.title,
      cue_stretching: "Hold",
    }),
  ]);
}

function listRow(
  result: Awaited<ReturnType<ExerciseLibraryService["searchApprovedExercises"]>>,
  exerciseId: string,
) {
  return result.exercises.find((row) => row.exercise_id === exerciseId);
}

describe("Exercise library usage_count from program rows (integration)", () => {
  it("orders most used by program row count descending", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exFew = id("ex-few-rows");
      const exMany = id("ex-many-rows");
      const verFew = id("ver-few");
      const verMany = id("ver-many");
      await seedApprovedExercise(storage, practId, {
        exerciseId: exFew,
        versionId: verFew,
        title: "Few rows",
      });
      await seedApprovedExercise(storage, practId, {
        exerciseId: exMany,
        versionId: verMany,
        title: "Many rows",
      });

      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId: id("prog-few"),
        rowId: id("row-few-1"),
        exerciseId: exFew,
        versionId: verFew,
        position: 0,
      });
      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId: id("prog-many"),
        rowId: id("row-many-1"),
        exerciseId: exMany,
        versionId: verMany,
        position: 0,
      });
      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId: id("prog-many"),
        rowId: id("row-many-2"),
        exerciseId: exMany,
        versionId: verMany,
        position: 1,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const result = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(result.exercises.map((row) => row.exercise_id)).toEqual([exMany, exFew]);
      expect(result.exercises[0]?.usage_count).toBe(2);
      expect(result.exercises[1]?.usage_count).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("counts duplicate rows in one program separately", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = id("ex-dup");
      const versionId = id("ver-dup");
      await seedApprovedExercise(storage, practId, {
        exerciseId,
        versionId,
        title: "Dup rows",
      });
      const programId = id("prog-dup");
      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId,
        rowId: id("row-dup-0"),
        exerciseId,
        versionId,
        position: 0,
      });
      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId,
        rowId: id("row-dup-1"),
        exerciseId,
        versionId,
        position: 1,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.usage_count).toBe(2);
      const list = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(listRow(list, exerciseId)?.usage_count).toBe(2);
    } finally {
      storage.close();
    }
  });

  it("counts program rows on older approved versions toward usage_count", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = id("ex-multi-version");
      const verV1 = id("ver-multi-v1");
      const verV2 = id("ver-multi-v2");
      await seedExercise(storage, practId, exerciseId);
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: verV1,
          exercise_id: exerciseId,
          version_number: 1,
          status: "approved",
          approved_by: practId,
          approved_at: TS,
          title: "Version one",
          cue_stretching: "Hold",
        }),
      ]);
      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId: id("prog-multi-v1"),
        rowId: id("row-multi-v1"),
        exerciseId,
        versionId: verV1,
        position: 0,
      });
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: verV2,
          exercise_id: exerciseId,
          version_number: 2,
          status: "approved",
          approved_by: practId,
          approved_at: "2026-02-01T00:00:00.000Z",
          title: "Version two",
          cue_stretching: "Hold",
        }),
      ]);
      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId: id("prog-multi-v2"),
        rowId: id("row-multi-v2"),
        exerciseId,
        versionId: verV2,
        position: 0,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.usage_count).toBe(2);
      expect(details.version_number).toBe(2);
      const list = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(listRow(list, exerciseId)?.usage_count).toBe(2);
    } finally {
      storage.close();
    }
  });

  it("returns usage_count 0 when the exercise is in no program row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = id("ex-unused");
      await seedApprovedExercise(storage, practId, {
        exerciseId,
        versionId: id("ver-unused"),
        title: "Unused",
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.usage_count).toBe(0);
      const list = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(listRow(list, exerciseId)?.usage_count).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("breaks most_used ties by exercise_id when titles and usage_count match", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exFirst = "00000000-0000-4000-8000-000000000001";
      const exSecond = "00000000-0000-4000-8000-000000000002";
      const exThird = "00000000-0000-4000-8000-000000000003";
      const sharedTitle = "Shared tie title";
      const tiedExercises = [
        {
          exerciseId: exThird,
          versionId: "00000000-0000-4000-8000-000000000013",
          rowId: id("row-tie-third"),
          progSeed: "prog-tie-third",
        },
        {
          exerciseId: exFirst,
          versionId: "00000000-0000-4000-8000-000000000011",
          rowId: id("row-tie-first"),
          progSeed: "prog-tie-first",
        },
        {
          exerciseId: exSecond,
          versionId: "00000000-0000-4000-8000-000000000012",
          rowId: id("row-tie-second"),
          progSeed: "prog-tie-second",
        },
      ] as const;
      for (const { exerciseId, versionId } of tiedExercises) {
        await seedApprovedExercise(storage, practId, {
          exerciseId,
          versionId,
          title: sharedTitle,
        });
      }
      for (const { exerciseId, versionId, rowId, progSeed } of tiedExercises) {
        await addProgramExerciseRow(storage, {
          practitionerId: practId,
          programId: id(progSeed),
          rowId,
          exerciseId,
          versionId,
          position: 0,
        });
      }

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const result = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(result.exercises.map((row) => row.exercise_id)).toEqual([
        exFirst,
        exSecond,
        exThird,
      ]);
      for (const exerciseId of [exFirst, exSecond, exThird]) {
        expect(listRow(result, exerciseId)?.usage_count).toBe(1);
      }
    } finally {
      storage.close();
    }
  });

  it("breaks most_used ties by title then exercise_id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exA = id("ex-tie-a");
      const exB = id("ex-tie-b");
      const verA = id("ver-tie-a");
      const verB = id("ver-tie-b");
      await seedApprovedExercise(storage, practId, {
        exerciseId: exB,
        versionId: verB,
        title: "ZZZ tie break",
      });
      await seedApprovedExercise(storage, practId, {
        exerciseId: exA,
        versionId: verA,
        title: "AAA tie break",
      });
      for (const [exerciseId, versionId, rowId] of [
        [exA, verA, id("row-tie-a")],
        [exB, verB, id("row-tie-b")],
      ] as const) {
        await addProgramExerciseRow(storage, {
          practitionerId: practId,
          programId: id(`prog-${exerciseId}`),
          rowId,
          exerciseId,
          versionId,
          position: 0,
        });
      }

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const result = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(result.exercises.map((row) => row.exercise_id)).toEqual([exA, exB]);
    } finally {
      storage.close();
    }
  });

  it("counts program rows globally across practitioners", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practA = await seedPractitioner(storage);
      const practB = await seedPractitioner(
        storage,
        testOpaqueEntityId("pract-b-global"),
        "other@example.com",
      );
      const exerciseId = id("ex-global");
      const versionId = id("ver-global");
      await seedApprovedExercise(storage, practA, {
        exerciseId,
        versionId,
        title: "Shared usage",
      });

      await addProgramExerciseRow(storage, {
        practitionerId: practA,
        programId: id("prog-a"),
        rowId: id("row-global-a"),
        exerciseId,
        versionId,
        position: 0,
      });
      await addProgramExerciseRow(storage, {
        practitionerId: practB,
        programId: id("prog-b"),
        rowId: id("row-global-b"),
        exerciseId,
        versionId,
        position: 0,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const forB = await service.getExerciseDetails(practB, exerciseId);
      expect(forB.usage_count).toBe(2);
      const list = await service.searchApprovedExercises({
        practitionerId: practB,
        sort: "most_used",
      });
      expect(listRow(list, exerciseId)?.usage_count).toBe(2);
    } finally {
      storage.close();
    }
  });

  it("does not count placeholder program rows without exercise_id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = id("ex-real");
      const versionId = id("ver-real");
      await seedApprovedExercise(storage, practId, {
        exerciseId,
        versionId,
        title: "Real exercise",
      });

      const requests = new ExerciseRequestsRepository(storage);
      const requestId = id("req-placeholder");
      await requests.insert({
        id: requestId,
        requestedName: "Pending move",
        requestedBy: practId,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });

      const programs = new ProgramsRepository(storage);
      const programId = id("prog-placeholder");
      await programs.create({
        id: programId,
        createdBy: practId,
        createdAt: TS,
      });
      await storage.run(
        `INSERT INTO program_rows (
          id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
          prescription_type, params_json, text_snapshot_json, note
        ) VALUES (?, ?, 0, NULL, NULL, ?, ?, ?, ?, NULL)`,
        [
          id("row-placeholder"),
          programId,
          requestId,
          "stretching",
          '{"hold_s":30}',
          '{"title":"Pending"}',
        ],
      );
      await addProgramExerciseRow(storage, {
        practitionerId: practId,
        programId,
        rowId: id("row-real"),
        exerciseId,
        versionId,
        position: 1,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.usage_count).toBe(1);
      const list = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(listRow(list, exerciseId)?.usage_count).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("does not count practitioner last_used_at without program rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = id("ex-pe-only");
      await seedApprovedExercise(storage, practId, {
        exerciseId,
        versionId: id("ver-pe-only"),
        title: "Saved only",
      });
      const { PractitionerExercisesRepository } =
        await import("../src/storage/repositories/exercise-data.js");
      const myRepo = new PractitionerExercisesRepository(storage);
      await myRepo.upsert({
        practitionerId: practId,
        exerciseId,
        savedAt: TS,
        lastUsedAt: TS,
      });

      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getExerciseDetails(practId, exerciseId);
      expect(details.usage_count).toBe(0);
      const list = await service.searchApprovedExercises({
        practitionerId: practId,
        sort: "most_used",
      });
      expect(listRow(list, exerciseId)?.usage_count).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("drops usage_count to 0 when the only program is deleted and back to 1 after restore", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exerciseId = id("ex-del-restore");
      const versionId = id("ver-del-restore");
      const programId = id("prog-del-restore");
      const fillerId = id("ex-del-restore-filler");
      await seedApprovedExercise(storage, practId, {
        exerciseId: fillerId,
        versionId: id("ver-del-restore-filler"),
        title: "AAA filler unused",
      });
      await seedApprovedExercise(storage, practId, {
        exerciseId,
        versionId,
        title: "Delete restore usage",
      });

      const programBuilder = new ProgramBuilderService(storage, () => TS);
      await programBuilder.createProgram(practId, { programId });
      await programBuilder.addExerciseRow(practId, programId, {
        rowId: id("row-del-restore"),
        exerciseId,
        exerciseVersionId: versionId,
      });

      const library = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const assertCounts = async (used: number, order: string[]) => {
        expect(
          (await library.getExerciseDetails(practId, exerciseId)).usage_count,
        ).toBe(used);
        const list = await library.searchApprovedExercises({
          practitionerId: practId,
          sort: "most_used",
        });
        expect(listRow(list, exerciseId)?.usage_count).toBe(used);
        expect(list.exercises.map((row) => row.exercise_id)).toEqual(order);
      };

      await assertCounts(1, [exerciseId, fillerId]);

      await programBuilder.deleteProgram(practId, programId);
      await assertCounts(0, [fillerId, exerciseId]);

      await programBuilder.restoreProgram(practId, programId);
      await assertCounts(1, [exerciseId, fillerId]);
    } finally {
      storage.close();
    }
  });
});
