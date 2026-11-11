import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConditionLabelKey } from "../src/domain/exercise-free-text.js";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { buildConditionLabelNormalizedBackfillUpdateSql } from "../src/storage/migrations/condition-label-normalize-sql.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
  MIGRATION_0008_ID,
  MIGRATION_0009_ID,
} from "../src/storage/migrations/apply.js";
import type { SqlStoragePort, SqlValue } from "../src/storage/ports/sql-storage.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import {
  ConditionsRepository,
  PractitionerRoutinesRepository,
  RoutineConditionsRepository,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  MIGRATION_0007_SQL,
  MIGRATION_0008_SQL,
  MIGRATION_0009_SQL,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const BODY_REGION_KNEE = "br-knee";

async function openThroughMigration0008(): Promise<BetterSqliteStorage> {
  const storage = BetterSqliteStorage.openInMemory();
  await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(storage, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(storage, MIGRATION_0007_ID, MIGRATION_0007_SQL);
  await applyMigration(storage, MIGRATION_0008_ID, MIGRATION_0008_SQL);
  return storage;
}

function normalizeSqlWhitespace(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function labelNormalizedUpdateFromMigrationFile(): string {
  const migrationSql = readFileSync(
    join(REPO_ROOT, "migrations/0009_routine_conditions.sql"),
    "utf8",
  );
  const match = migrationSql.match(
    /UPDATE conditions[\s\S]*?WHERE label IS NOT NULL\s+AND label_normalized IS NULL;/,
  );
  if (!match) {
    throw new Error("0009 migration is missing label_normalized backfill UPDATE");
  }
  return match[0];
}

async function snapshotRoutineDomainTables(
  storage: SqlStoragePort,
): Promise<Record<string, Record<string, SqlValue>[]>> {
  const tableNames = [
    "routines",
    "routine_versions",
    "practitioner_routines",
    "programs",
  ] as const;
  const snapshot: Record<string, Record<string, SqlValue>[]> = {};
  for (const table of tableNames) {
    snapshot[table] = await storage.all<Record<string, SqlValue>>(
      `SELECT * FROM ${table} ORDER BY id ASC`,
    );
  }
  return snapshot;
}

/** Backfill DML exactly as shipped in migrations/0009_routine_conditions.sql (not a test-local copy). */
export function routineConditionsBackfillSqlFromMigration0009(): string {
  const migrationSql = readFileSync(
    join(REPO_ROOT, "migrations/0009_routine_conditions.sql"),
    "utf8",
  );
  const match = migrationSql.match(
    /INSERT OR IGNORE INTO routine_conditions\b[\s\S]*?WHERE condition_id IS NOT NULL\s*;/,
  );
  if (!match) {
    throw new Error("0009 migration is missing routine_conditions backfill INSERT");
  }
  return match[0];
}

async function openD1MigratedStorage(): Promise<D1SqlStorage> {
  const sql = new D1SqlStorage(createFakePhysioD1Database());
  await applyMigration(sql, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(sql, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(sql, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(sql, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(sql, MIGRATION_0007_ID, MIGRATION_0007_SQL);
  await applyMigration(sql, MIGRATION_0008_ID, MIGRATION_0008_SQL);
  await applyMigration(sql, MIGRATION_0009_ID, MIGRATION_0009_SQL);
  return sql;
}

async function expectSqliteError(
  fn: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await expect(fn()).rejects.toThrow(pattern);
}

async function seedRoutineWithOptionalCondition(
  storage: SqlStoragePort,
  author: string,
  routineSeed: string,
  conditionId: string | null,
): Promise<string> {
  const routines = new RoutinesRepository(storage);
  await routines.createDraft({
    id: id(routineSeed),
    draftVersionId: id(`${routineSeed}-draft-ver`),
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
    conditionId,
  });
  return id(routineSeed);
}

describe("0009 routine conditions migration (integration)", () => {
  it("0009 migration SQL has no BEGIN or COMMIT", () => {
    expect(MIGRATION_0009_SQL).not.toMatch(/\bBEGIN\b/);
    expect(MIGRATION_0009_SQL).not.toMatch(/\bCOMMIT\b/);
  });

  it("ships canonical label_normalized backfill UPDATE matching the adapter", () => {
    const fromFile = labelNormalizedUpdateFromMigrationFile();
    const canonical = `${buildConditionLabelNormalizedBackfillUpdateSql()};`;
    expect(normalizeSqlWhitespace(fromFile)).toBe(normalizeSqlWhitespace(canonical));
  });

  it("applyMigration skips re-running 0009 as a whole", async () => {
    const storage = await openMigratedDatabase();
    try {
      await applyMigration(storage, MIGRATION_0009_ID, MIGRATION_0009_SQL);
      const rows = await storage.all<{ id: string }>(
        "SELECT id FROM schema_migrations WHERE id = ?",
        [MIGRATION_0009_ID],
      );
      expect(rows).toHaveLength(1);
    } finally {
      storage.close();
    }
  });

  it("backfills at apply time when routines already have condition_id", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
      await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
      await applyMigration(storage, MIGRATION_0005_ID, MIGRATION_0005_SQL);
      await applyMigration(storage, MIGRATION_0007_ID, MIGRATION_0007_SQL);
      await applyMigration(storage, MIGRATION_0008_ID, MIGRATION_0008_SQL);
      const author = await seedPractitioner(storage);
      const condId = id("cond-pre-migrate");
      await storage.run(
        `INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, ?)`,
        [condId, "Pre migrate", 0],
      );
      await seedRoutineWithOptionalCondition(
        storage,
        author,
        "routine-pre-0009",
        condId,
      );
      await seedRoutineWithOptionalCondition(storage, author, "routine-pre-none", null);
      await applyMigration(storage, MIGRATION_0009_ID, MIGRATION_0009_SQL);
      const join = new RoutineConditionsRepository(storage);
      expect(await join.listConditionIdsForRoutine(id("routine-pre-0009"))).toEqual([
        condId,
      ]);
      expect(await join.listConditionIdsForRoutine(id("routine-pre-none"))).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("migration backfill SQL is idempotent when join rows already exist", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const condId = id("cond-backfill");
      await new ConditionsRepository(storage).insert({
        id: condId,
        label: "Knee OA",
      });
      const withCond = await seedRoutineWithOptionalCondition(
        storage,
        author,
        "routine-with-cond",
        condId,
      );
      const withoutCond = await seedRoutineWithOptionalCondition(
        storage,
        author,
        "routine-no-cond",
        null,
      );

      await storage.run(`DELETE FROM routine_conditions`);
      const backfill = routineConditionsBackfillSqlFromMigration0009();

      await storage.run(backfill);
      const countAfterFirst = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM routine_conditions",
      );
      expect(countAfterFirst?.c).toBe(1);

      await storage.run(backfill);
      const countAfterSecond = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM routine_conditions",
      );
      expect(countAfterSecond).toEqual(countAfterFirst);

      const join = new RoutineConditionsRepository(storage);
      expect(await join.listConditionIdsForRoutine(withCond)).toEqual([condId]);
      expect(await join.listConditionIdsForRoutine(withoutCond)).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("leaves routines, versions, saved copies, and program origin unchanged (0008 → 0009)", async () => {
    const storage = await openThroughMigration0008();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);
      const programs = new ProgramsRepository(storage);
      const condId = id("cond-snap");
      await storage.run(
        `INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, 0)`,
        [condId, "Knee pain"],
      );
      await routines.createDraft({
        id: id("routine-snap"),
        draftVersionId: id("rv-snap-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
        conditionId: condId,
      });
      await rows.replaceDraftRow({
        id: id("rvr-snap"),
        routineId: id("routine-snap"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("routine-snap"),
        authorId: author,
        publishedAt: TS,
        name: "Snap routine",
      });
      await my.saveFrozenCopy({
        id: id("pr-snap"),
        practitionerId: author,
        routineId: id("routine-snap"),
        sourceRoutineVersionId: published.id,
        savedAt: TS,
        rows: [
          {
            id: id("prr-snap"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      await programs.create({
        id: id("prog-snap"),
        createdBy: author,
        createdAt: TS,
        routineOrigin: {
          routineId: id("routine-snap"),
          routineVersionId: published.id,
          origin: "tweaked",
        },
      });

      const before = await snapshotRoutineDomainTables(storage);
      await applyMigration(storage, MIGRATION_0009_ID, MIGRATION_0009_SQL);
      const after = await snapshotRoutineDomainTables(storage);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("backfills label_normalized on pre-0009 condition rows", async () => {
    const storage = await openThroughMigration0008();
    try {
      const condId = id("cond-legacy-space");
      const rawLabel = "  LOW\tback\n";
      await storage.run(
        `INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, 0)`,
        [condId, rawLabel],
      );
      await applyMigration(storage, MIGRATION_0009_ID, MIGRATION_0009_SQL);
      const row = await storage.first<{ label_normalized: string }>(
        "SELECT label_normalized FROM conditions WHERE id = ? LIMIT 1",
        [condId],
      );
      expect(row?.label_normalized).toBe(normalizeConditionLabelKey(rawLabel));
    } finally {
      storage.close();
    }
  });

  it("fails 0009 when pre-existing condition labels collide after normalisation", async () => {
    const storage = await openThroughMigration0008();
    try {
      await storage.run(
        `INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, 0)`,
        [id("cond-collide-a"), "Low  back"],
      );
      await storage.run(
        `INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, 0)`,
        [id("cond-collide-b"), "Low back"],
      );
      await expect(
        applyMigration(storage, MIGRATION_0009_ID, MIGRATION_0009_SQL),
      ).rejects.toThrow();
      const index = await storage.first<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_conditions_label_normalized'",
      );
      expect(index).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("defines routine_conditions without ON DELETE CASCADE from conditions", async () => {
    const storage = await openMigratedDatabase();
    try {
      const row = await storage.first<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'routine_conditions' LIMIT 1",
      );
      const sql = row?.sql ?? "";
      expect(sql).toMatch(/REFERENCES conditions/);
      expect(sql).not.toMatch(/ON DELETE CASCADE/i);
      expect(sql).toMatch(/ON DELETE RESTRICT/i);
    } finally {
      storage.close();
    }
  });

  it("documents deprecated routines.body_region_id in migration file", () => {
    const text = readFileSync(
      join(REPO_ROOT, "migrations/0009_routine_conditions.sql"),
      "utf8",
    );
    expect(text).toMatch(/body_region_id: DEPRECATED/i);
  });
});

describe("routine_conditions repository (integration, SQLite + D1 fake)", () => {
  const cases: {
    label: string;
    open: () => Promise<SqlStoragePort & { close?: () => void }>;
  }[] = [
    { label: "BetterSqliteStorage", open: () => openMigratedDatabase() },
    { label: "D1SqlStorage fake", open: () => openD1MigratedStorage() },
  ];

  it.each(cases)(
    "rejects duplicate routine_conditions pair on $label",
    async ({ open }) => {
      const storage = await open();
      try {
        const author = await seedPractitioner(storage);
        const condId = id("cond-dup-pair");
        await new ConditionsRepository(storage).insert({ id: condId, label: "Sprain" });
        const routineId = await seedRoutineWithOptionalCondition(
          storage,
          author,
          "routine-dup-pair",
          null,
        );
        const join = new RoutineConditionsRepository(storage);
        await join.link(routineId, condId);
        const beforeCount = await storage.first<{ c: number }>(
          "SELECT COUNT(*) AS c FROM routine_conditions WHERE routine_id = ?",
          [routineId],
        );
        expect(beforeCount?.c).toBe(1);
        try {
          await storage.run(
            `INSERT INTO routine_conditions (routine_id, condition_id) VALUES (?, ?)`,
            [routineId, condId],
          );
        } catch {
          // Expected when PRIMARY KEY or equivalent uniqueness exists.
        }
        const afterCount = await storage.first<{ c: number }>(
          "SELECT COUNT(*) AS c FROM routine_conditions WHERE routine_id = ?",
          [routineId],
        );
        expect(afterCount?.c).toBe(1);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    },
  );

  it.each(cases)("enforces foreign keys on $label", async ({ open }) => {
    const storage = await open();
    try {
      const author = await seedPractitioner(storage);
      const routineId = await seedRoutineWithOptionalCondition(
        storage,
        author,
        "routine-fk",
        null,
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO routine_conditions (routine_id, condition_id) VALUES (?, ?)`,
            [routineId, id("cond-missing")],
          ),
        /FOREIGN KEY constraint failed/i,
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO routine_conditions (routine_id, condition_id) VALUES (?, ?)`,
            [id("routine-missing"), id("cond-missing")],
          ),
        /FOREIGN KEY constraint failed/i,
      );
    } finally {
      if ("close" in storage && typeof storage.close === "function") {
        storage.close();
      }
    }
  });

  it.each(cases)(
    "rejects delete of condition or routine referenced in routine_conditions on $label",
    async ({ open }) => {
      const storage = await open();
      try {
        const author = await seedPractitioner(storage);
        const condId = id("cond-restrict-del");
        await new ConditionsRepository(storage).insert({
          id: condId,
          label: "Tendinopathy",
        });
        const routineId = await seedRoutineWithOptionalCondition(
          storage,
          author,
          "routine-restrict-del",
          null,
        );
        const join = new RoutineConditionsRepository(storage);
        await join.link(routineId, condId);

        await expectSqliteError(
          () => new ConditionsRepository(storage).deleteById(condId),
          /FOREIGN KEY constraint failed/i,
        );
        expect(await join.listConditionIdsForRoutine(routineId)).toEqual([condId]);

        await expectSqliteError(
          () => storage.run(`DELETE FROM routines WHERE id = ?`, [routineId]),
          /FOREIGN KEY constraint failed/i,
        );
        expect(await join.listConditionIdsForRoutine(routineId)).toEqual([condId]);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    },
  );
});

describe("conditions label_normalized (integration, SQLite)", () => {
  it("stores normalized label and rejects case or spacing duplicates", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const conditions = new ConditionsRepository(storage);
      await conditions.insert({
        id: id("cond-a"),
        label: "  Low   Back ",
        createdByPractitionerId: author,
      });
      expect(await conditions.findByLabelNormalizedKey("low back")).toMatchObject({
        id: id("cond-a"),
        label_normalized: "low back",
        created_by_practitioner_id: author,
      });
      await expectSqliteError(
        () => conditions.insert({ id: id("cond-b"), label: "Low Back" }),
        /UNIQUE constraint failed: conditions\.label_normalized/i,
      );
      await expectSqliteError(
        () => conditions.insert({ id: id("cond-c"), label: "low  back" }),
        /UNIQUE constraint failed: conditions\.label_normalized/i,
      );
    } finally {
      storage.close();
    }
  });

  it("rejects rename that collides on normalized key", async () => {
    const storage = await openMigratedDatabase();
    try {
      const conditions = new ConditionsRepository(storage);
      await conditions.insert({ id: id("cond-x"), label: "Neck pain" });
      await conditions.insert({ id: id("cond-y"), label: "Hip pain" });
      await expectSqliteError(
        () => conditions.updateLabel({ id: id("cond-y"), label: "  neck   pain" }),
        /UNIQUE constraint failed: conditions\.label_normalized/i,
      );
    } finally {
      storage.close();
    }
  });

  it("serves typeahead ordered by sort_order and label", async () => {
    const storage = await openMigratedDatabase();
    try {
      const conditions = new ConditionsRepository(storage);
      await conditions.insert({
        id: id("cond-knee"),
        label: "Knee pain",
        sortOrder: 1,
      });
      await conditions.insert({
        id: id("cond-knee2"),
        label: "Knee surgery",
        sortOrder: 0,
      });
      await conditions.insert({ id: id("cond-back"), label: "Low back", sortOrder: 0 });
      const matches = await conditions.searchTypeaheadByLabel("knee", 10);
      expect(matches.map((row) => row.id)).toEqual([id("cond-knee2"), id("cond-knee")]);
    } finally {
      storage.close();
    }
  });

  it("runs conditions repository on D1 fake migrated storage", async () => {
    const sql = await openD1MigratedStorage();
    await seedPractitioner(sql);
    const conditions = new ConditionsRepository(sql);
    await conditions.insert({ id: id("cond-d1"), label: "Ankle sprain" });
    expect(await conditions.listAll()).toHaveLength(1);
  });
});

describe("routine_conditions replaceAll (integration, SQLite)", () => {
  it("replaceAllForRoutine is idempotent for the same set", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const conditions = new ConditionsRepository(storage);
      const c1 = id("cond-r1");
      const c2 = id("cond-r2");
      await conditions.insert({ id: c1, label: "Arthritis" });
      await conditions.insert({ id: c2, label: "Post-op" });
      const routineId = await seedRoutineWithOptionalCondition(
        storage,
        author,
        "routine-replace",
        null,
      );
      const join = new RoutineConditionsRepository(storage);
      const set = [c2, c1] as const;
      await join.replaceAllForRoutine(routineId, set);
      await join.replaceAllForRoutine(routineId, set);
      const linked = await join.listConditionIdsForRoutine(routineId);
      expect(linked).toHaveLength(2);
      expect(new Set(linked)).toEqual(new Set([c1, c2]));
    } finally {
      storage.close();
    }
  });
});
