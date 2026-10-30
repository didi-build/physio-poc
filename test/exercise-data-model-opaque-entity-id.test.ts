import { describe, expect, it } from "vitest";
import {
  generateOpaqueEntityId,
  OpaqueEntityIdValidationError,
  validateOpaqueEntityId,
} from "../src/domain/opaque-entity-id.js";
import {
  ExerciseAliasesRepository,
  ExercisesRepository,
  ExerciseVersionsRepository,
  PractitionersRepository,
} from "../src/storage/repositories/exercise-data.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import {
  FIXTURE_PRACTITIONER_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const REJECT_IDS = ["John-Smith-knee", "john-smith-knee", "knee"] as const;

function validVersionInsert(exerciseId: string, versionId: string) {
  return {
    id: versionId,
    exerciseId,
    versionNumber: 2,
    status: "draft" as const,
    approvedBy: null,
    approvedAt: null,
    title: "Heel slide",
    createdAt: TS,
  };
}

describe("DIDI-1048 opaque caller-supplied exercise data entity ids", () => {
  it("rejects invalid practitioner ids on insert and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const repo = new PractitionersRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          repo.insert({ id: badId, email: "coach@example.com", created_at: TS }),
        ).rejects.toThrow(OpaqueEntityIdValidationError);
        expect(await repo.findById(badId)).toBeNull();
      }
      const validId = generateOpaqueEntityId();
      await repo.insert({ id: validId, email: "valid@example.com", created_at: TS });
      expect(await repo.findById(validId)).not.toBeNull();
      for (const badId of REJECT_IDS) {
        expect(await repo.findById(badId)).toBeNull();
      }
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise ids on insert and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      await seedPractitioner(storage);
      const repo = new ExercisesRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          repo.insert({
            id: badId,
            category: "stretch",
            created_by: FIXTURE_PRACTITIONER_ID,
            created_at: TS,
          }),
        ).rejects.toThrow("Exercise id must be a UUID v4 opaque id");
        expect(
          await storage.first<{ id: string }>(
            "SELECT id FROM exercises WHERE id = ? LIMIT 1",
            [badId],
          ),
        ).toBeNull();
      }
      const validId = generateOpaqueEntityId();
      await repo.insert({
        id: validId,
        category: "stretch",
        created_by: FIXTURE_PRACTITIONER_ID,
        created_at: TS,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM exercises WHERE id = ? LIMIT 1",
          [validId],
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise version ids on insert and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const repo = new ExerciseVersionsRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(repo.insert(validVersionInsert(exId, badId))).rejects.toThrow(
          "Exercise version id must be a UUID v4 opaque id",
        );
        expect(
          await storage.first<{ id: string }>(
            "SELECT id FROM exercise_versions WHERE id = ? LIMIT 1",
            [badId],
          ),
        ).toBeNull();
      }
      const validId = generateOpaqueEntityId();
      await repo.insert(validVersionInsert(exId, validId));
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM exercise_versions WHERE id = ? LIMIT 1",
          [validId],
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise alias ids on insert and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const repo = new ExerciseAliasesRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          repo.insert({
            id: badId,
            exerciseId: exId,
            alias: "SLR",
            createdAt: TS,
          }),
        ).rejects.toThrow("Exercise alias id must be a UUID v4 opaque id");
        expect(
          await storage.first<{ id: string }>(
            "SELECT id FROM exercise_aliases WHERE id = ? LIMIT 1",
            [badId],
          ),
        ).toBeNull();
      }
      const validId = generateOpaqueEntityId();
      await repo.insert({
        id: validId,
        exerciseId: exId,
        alias: "Straight leg raise",
        createdAt: TS,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM exercise_aliases WHERE id = ? LIMIT 1",
          [validId],
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid type default ids on upsertPractitionerDefaults and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const repo = new TypeDefaultsRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          repo.upsertPractitionerDefaults(badId, practId, "stretching", {
            hold_s: 30,
          }),
        ).rejects.toThrow("Type default id must be a UUID v4 opaque id");
        expect(
          await storage.first<{ id: string }>(
            "SELECT id FROM type_defaults WHERE id = ? LIMIT 1",
            [badId],
          ),
        ).toBeNull();
      }
      const validId = generateOpaqueEntityId();
      await repo.upsertPractitionerDefaults(validId, practId, "isometric", {
        hold_s: 20,
      });
      expect(await repo.getPractitionerDefaults(practId, "isometric")).toEqual({
        hold_s: 20,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
          ["practitioner", practId, "isometric"],
        ),
      ).toMatchObject({ id: validId.toLowerCase() });
    } finally {
      storage.close();
    }
  });

  it("stores normalized lowercase UUIDs from repository writes", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const upperVersionId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
      const versions = new ExerciseVersionsRepository(storage);
      await versions.insert({
        id: upperVersionId,
        exerciseId: exId,
        versionNumber: 3,
        status: "draft",
        approvedBy: null,
        approvedAt: null,
        title: "Heel slide",
        createdAt: TS,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM exercise_versions WHERE id = ? LIMIT 1",
          [validateOpaqueEntityId(upperVersionId, "Exercise version id")],
        ),
      ).not.toBeNull();

      const upperAliasId = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
      const aliases = new ExerciseAliasesRepository(storage);
      await aliases.insert({
        id: upperAliasId,
        exerciseId: exId,
        alias: "Alias",
        createdAt: TS,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM exercise_aliases WHERE id = ? LIMIT 1",
          [upperAliasId.toLowerCase()],
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise ids when inserting an exercise version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedExercise(storage, practId);
      const repo = new ExerciseVersionsRepository(storage);
      const versionId = id("version-exercise-id-guard");
      for (const badExerciseId of REJECT_IDS) {
        await expect(
          repo.insert(validVersionInsert(badExerciseId, versionId)),
        ).rejects.toThrow("Exercise id must be a UUID v4 opaque id");
      }
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise ids when inserting an exercise alias", async () => {
    const storage = await openMigratedDatabase();
    try {
      const repo = new ExerciseAliasesRepository(storage);
      const aliasId = id("alias-exercise-id-guard");
      for (const badExerciseId of REJECT_IDS) {
        await expect(
          repo.insert({
            id: aliasId,
            exerciseId: badExerciseId,
            alias: "SLR",
            createdAt: TS,
          }),
        ).rejects.toThrow("Exercise id must be a UUID v4 opaque id");
      }
    } finally {
      storage.close();
    }
  });

  it("rejects invalid created_by when inserting an exercise", async () => {
    const storage = await openMigratedDatabase();
    try {
      const repo = new ExercisesRepository(storage);
      const exerciseId = id("exercise-created-by-guard");
      for (const badPractitionerId of REJECT_IDS) {
        await expect(
          repo.insert({
            id: exerciseId,
            category: "stretch",
            created_by: badPractitionerId,
            created_at: TS,
          }),
        ).rejects.toThrow("Practitioner id must be a UUID v4 opaque id");
      }
    } finally {
      storage.close();
    }
  });
});
