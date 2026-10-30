import { describe, expect, it } from "vitest";
import {
  generateOpaqueEntityId,
  OpaqueEntityIdValidationError,
} from "../src/domain/opaque-entity-id.js";
import {
  ExerciseAliasesRepository,
  ExerciseBodyRegionsRepository,
  ExercisesRepository,
  ExerciseVersionsRepository,
  PractitionerExercisesRepository,
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

const UPPER_PRACTITIONER_ID = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const UPPER_EXERCISE_ID = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
const UPPER_VERSION_ID = "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC";
const UPPER_ALIAS_ID = "DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD";
const UPPER_TYPE_DEFAULT_ID = "EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE";
const UPPER_MEDIA_SET_ID = "FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF";

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

  it("rejects invalid approvedBy values on exercise version insert", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const repo = new ExerciseVersionsRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          repo.insert({
            ...validVersionInsert(exId, id(`ver-approved-by-${badId}`)),
            status: "approved",
            approvedBy: badId,
            approvedAt: TS,
          }),
        ).rejects.toThrow("Practitioner id must be a UUID v4 opaque id");
        expect(
          await storage.first<{ id: string }>(
            "SELECT id FROM exercise_versions WHERE id = ? LIMIT 1",
            [id(`ver-approved-by-${badId}`).toLowerCase()],
          ),
        ).toBeNull();
      }
    } finally {
      storage.close();
    }
  });

  it("rejects invalid mediaSetId values on exercise version insert", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const repo = new ExerciseVersionsRepository(storage);
      for (const badId of REJECT_IDS) {
        const versionId = id(`ver-media-${badId}`);
        await expect(
          repo.insert({
            ...validVersionInsert(exId, versionId),
            mediaSetId: badId,
          }),
        ).rejects.toThrow("Media set id must be a UUID v4 opaque id");
        expect(
          await storage.first<{ media_set_id: string | null }>(
            "SELECT media_set_id FROM exercise_versions WHERE id = ? LIMIT 1",
            [versionId.toLowerCase()],
          ),
        ).toBeNull();
      }
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

  it("stores lowercase UUIDs for every validated caller-supplied id field", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioners = new PractitionersRepository(storage);
      await practitioners.insert({
        id: UPPER_PRACTITIONER_ID,
        email: "upper@example.com",
        created_at: TS,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM practitioners WHERE email = ? LIMIT 1",
          ["upper@example.com"],
        ),
      ).toEqual({ id: UPPER_PRACTITIONER_ID.toLowerCase() });

      const exercises = new ExercisesRepository(storage);
      await exercises.insert({
        id: UPPER_EXERCISE_ID,
        category: "stretch",
        created_by: UPPER_PRACTITIONER_ID,
        created_at: TS,
      });
      expect(
        await storage.first<{ id: string; created_by: string }>(
          "SELECT id, created_by FROM exercises WHERE id = ? LIMIT 1",
          [UPPER_EXERCISE_ID.toLowerCase()],
        ),
      ).toEqual({
        id: UPPER_EXERCISE_ID.toLowerCase(),
        created_by: UPPER_PRACTITIONER_ID.toLowerCase(),
      });

      const versions = new ExerciseVersionsRepository(storage);
      await versions.insert({
        id: UPPER_VERSION_ID,
        exerciseId: UPPER_EXERCISE_ID,
        versionNumber: 1,
        status: "approved",
        approvedBy: UPPER_PRACTITIONER_ID,
        approvedAt: TS,
        title: "Heel slide",
        mediaSetId: UPPER_MEDIA_SET_ID,
        createdAt: TS,
      });
      expect(
        await storage.first<{
          id: string;
          exercise_id: string;
          approved_by: string | null;
          media_set_id: string | null;
        }>(
          "SELECT id, exercise_id, approved_by, media_set_id FROM exercise_versions WHERE id = ? LIMIT 1",
          [UPPER_VERSION_ID.toLowerCase()],
        ),
      ).toEqual({
        id: UPPER_VERSION_ID.toLowerCase(),
        exercise_id: UPPER_EXERCISE_ID.toLowerCase(),
        approved_by: UPPER_PRACTITIONER_ID.toLowerCase(),
        media_set_id: UPPER_MEDIA_SET_ID.toLowerCase(),
      });

      const aliases = new ExerciseAliasesRepository(storage);
      await aliases.insert({
        id: UPPER_ALIAS_ID,
        exerciseId: UPPER_EXERCISE_ID,
        alias: "Alias",
        createdAt: TS,
      });
      expect(
        await storage.first<{ id: string; exercise_id: string }>(
          "SELECT id, exercise_id FROM exercise_aliases WHERE id = ? LIMIT 1",
          [UPPER_ALIAS_ID.toLowerCase()],
        ),
      ).toEqual({
        id: UPPER_ALIAS_ID.toLowerCase(),
        exercise_id: UPPER_EXERCISE_ID.toLowerCase(),
      });

      const typeDefaults = new TypeDefaultsRepository(storage);
      await typeDefaults.upsertPractitionerDefaults(
        UPPER_TYPE_DEFAULT_ID,
        UPPER_PRACTITIONER_ID,
        "stretching",
        { hold_s: 30 },
      );
      expect(
        await storage.first<{ id: string; practitioner_id: string | null }>(
          "SELECT id, practitioner_id FROM type_defaults WHERE id = ? LIMIT 1",
          [UPPER_TYPE_DEFAULT_ID.toLowerCase()],
        ),
      ).toEqual({
        id: UPPER_TYPE_DEFAULT_ID.toLowerCase(),
        practitioner_id: UPPER_PRACTITIONER_ID.toLowerCase(),
      });
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

  it("rejects invalid practitionerId on upsertPractitionerDefaults", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const repo = new TypeDefaultsRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          repo.upsertPractitionerDefaults(id("td-pract-guard"), badId, "stretching", {
            hold_s: 30,
          }),
        ).rejects.toThrow("Practitioner id must be a UUID v4 opaque id");
        expect(await repo.getPractitionerDefaults(badId, "stretching")).toEqual({});
      }
      expect(await repo.getPractitionerDefaults(practId, "stretching")).toEqual({});
    } finally {
      storage.close();
    }
  });

  it("rejects invalid ids on PractitionerExercisesRepository upsert", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const repo = new PractitionerExercisesRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          repo.upsert({
            practitionerId: badId,
            exerciseId: exId,
            savedAt: TS,
          }),
        ).rejects.toThrow("Practitioner id must be a UUID v4 opaque id");
        await expect(
          repo.upsert({
            practitionerId: practId,
            exerciseId: badId,
            savedAt: TS,
          }),
        ).rejects.toThrow("Exercise id must be a UUID v4 opaque id");
      }
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exerciseId on ExerciseBodyRegionsRepository link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      const repo = new ExerciseBodyRegionsRepository(storage);
      await repo.link(exId, "br-knee");
      for (const badId of REJECT_IDS) {
        await expect(repo.link(badId, "br-knee")).rejects.toThrow(
          "Exercise id must be a UUID v4 opaque id",
        );
      }
    } finally {
      storage.close();
    }
  });
});
