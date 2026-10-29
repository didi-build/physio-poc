import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";

describe("exercise data model SQL constraints (integration, SQLite)", () => {
  it("enables foreign_keys in the better-sqlite adapter", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    expect(storage.foreignKeysEnabled()).toBe(true);
    storage.close();
  });

  it("rejects exercises.created_by foreign key violations", async () => {
    const storage = await openMigratedDatabase();
    try {
      await expect(
        storage.run(
          "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
          ["ex-bad", "stretch", "missing-practitioner", TS],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise category CHECK", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await expect(
        storage.run(
          "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
          ["ex-2", "cardio", practId, TS],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid practitioner_exercises.favourite CHECK", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      await expect(
        storage.run(
          `INSERT INTO practitioner_exercises (
            practitioner_id, exercise_id, favourite, saved_at,
            text_overrides_json, param_overrides_json
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [practId, exId, 2, TS, "{}", "{}"],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid type_defaults.type CHECK", async () => {
    const storage = await openMigratedDatabase();
    try {
      await expect(
        storage.run(
          `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
           VALUES (?, ?, ?, ?, ?)`,
          ["td-bad", "global", null, "cardio", "{}"],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects type_defaults scope and practitioner_id mismatch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await expect(
        storage.run(
          `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
           VALUES (?, ?, ?, ?, ?)`,
          ["td-global-bad", "global", practId, "stretching", '{"hold_s":30}'],
        ),
      ).rejects.toThrow();
      await expect(
        storage.run(
          `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
           VALUES (?, ?, ?, ?, ?)`,
          ["td-pract-bad", "practitioner", null, "stretching", '{"hold_s":30}'],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects duplicate global type_defaults rows for the same type", async () => {
    const storage = await openMigratedDatabase();
    try {
      await expect(
        storage.run(
          `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
           VALUES (?, ?, ?, ?, ?)`,
          [
            "td-dup-global",
            "global",
            null,
            "stretching",
            '{"hold_s":30,"days_per_week":7}',
          ],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects duplicate exercise_versions for the same exercise and version_number", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedExercise(storage, practId);
      await storage.run(VERSION_INSERT_SQL, versionInsertBindings());
      await expect(
        storage.run(
          VERSION_INSERT_SQL,
          versionInsertBindings({ id: "ver-2", title: "Heel slide 2" }),
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects duplicate exercise_aliases by case-insensitive alias index", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const exId = await seedExercise(storage, practId);
      await storage.run(
        "INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)",
        ["alias-1", exId, "SLR", TS],
      );
      await expect(
        storage.run(
          "INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)",
          ["alias-2", exId, "slr", TS],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects exercise_versions with invalid version_number, title, or approval fields", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await seedExercise(storage, practId);

      await expect(
        storage.run(VERSION_INSERT_SQL, versionInsertBindings({ version_number: 0 })),
      ).rejects.toThrow();

      await expect(
        storage.run(
          VERSION_INSERT_SQL,
          versionInsertBindings({ id: "ver-empty-title", title: "   " }),
        ),
      ).rejects.toThrow();

      await expect(
        storage.run(
          VERSION_INSERT_SQL,
          versionInsertBindings({
            id: "ver-approved-missing",
            status: "approved",
            approved_by: null,
            approved_at: null,
          }),
        ),
      ).rejects.toThrow();

      await expect(
        storage.run(
          VERSION_INSERT_SQL,
          versionInsertBindings({
            id: "ver-draft-with-approver",
            status: "draft",
            approved_by: practId,
            approved_at: TS,
          }),
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects whitespace-only exercise_requests.requested_name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      await expect(
        storage.run(
          `INSERT INTO exercise_requests (
            id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ["req-1", "   ", null, practId, "open", null, TS, TS],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });
});
