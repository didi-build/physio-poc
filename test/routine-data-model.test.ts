import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import {
  ConditionsRepository,
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
  validateProgramRoutineOriginTrio,
} from "../src/storage/repositories/routines.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  MIGRATION_0005_SQL,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const BODY_REGION_KNEE = "br-knee";

async function expectSqliteError(
  fn: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await expect(fn()).rejects.toThrow(pattern);
}

describe("routine data model migration (integration, SQLite)", () => {
  it("0005 migration SQL has no BEGIN or COMMIT", () => {
    expect(MIGRATION_0005_SQL).not.toMatch(/\bBEGIN\b/);
    expect(MIGRATION_0005_SQL).not.toMatch(/\bCOMMIT\b/);
  });

  it("seeds conditions table empty", async () => {
    const storage = await openMigratedDatabase();
    try {
      const conditions = await new ConditionsRepository(storage).listAll();
      expect(conditions).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("defines ON DELETE RESTRICT on routine model foreign keys", async () => {
    const storage = await openMigratedDatabase();
    try {
      const tables = [
        "conditions",
        "routines",
        "routine_versions",
        "routine_version_rows",
        "practitioner_routines",
        "practitioner_routine_rows",
      ];
      for (const name of tables) {
        const row = await storage.first<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
          [name],
        );
        const sql = row?.sql ?? "";
        const fkCount = (sql.match(/REFERENCES/gi) ?? []).length;
        const restrictCount = (sql.match(/ON DELETE RESTRICT/gi) ?? []).length;
        expect(restrictCount, name).toBe(fkCount);
      }
      const programsAlter = readFileSync(
        join(REPO_ROOT, "migrations/0005_routine_data_model.sql"),
        "utf8",
      );
      expect(
        programsAlter.match(/ON DELETE RESTRICT/gi)?.length ?? 0,
      ).toBeGreaterThanOrEqual(2);
    } finally {
      storage.close();
    }
  });
});

describe("routine drafts and versions (repository, SQLite)", () => {
  it("keeps draft routines visible only to the author", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-author"),
        "author@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("pract-other"),
        "other@example.com",
      );
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("routine-draft"),
        draftVersionId: id("rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
        name: "Hidden draft",
      });
      expect(
        await routines.findVisibleToPractitioner(id("routine-draft"), author),
      ).not.toBeNull();
      expect(
        await routines.findVisibleToPractitioner(id("routine-draft"), other),
      ).toBeNull();
      expect(await routines.listDraftsForAuthor(other)).toHaveLength(0);
      expect(await routines.listDraftsForAuthor(author)).toHaveLength(1);
      expect(await routines.listPublishedCommunity()).toHaveLength(0);
    } finally {
      storage.close();
    }
  });

  it("pins exercise_version_id on routine version rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      await routines.createDraft({
        id: id("routine-pin"),
        draftVersionId: id("rv-pin-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("rvr-pin"),
        routineId: id("routine-pin"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("routine-pin"),
        authorId: author,
        publishedAt: TS,
        name: "Knee starter",
      });
      const pinned = await rows.listForVersion(published.id);
      expect(pinned[0]?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
      const v2 = await versions.savePublishedVersion({
        id: id("rv-pin-v2"),
        routineId: id("routine-pin"),
        createdBy: author,
        createdAt: TS,
        name: "Knee starter v2",
        copyFromVersionId: published.id,
      });
      const stillPinned = await rows.listForVersion(v2.id);
      expect(stillPinned[0]?.exercise_version_id).toBe(FIXTURE_VERSION_ID);
    } finally {
      storage.close();
    }
  });
});

describe("practitioner frozen copies (repository, SQLite)", () => {
  it("does not change saved copy rows when the community routine gets a new version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-community"),
        "community@example.com",
      );
      const saver = await seedPractitioner(
        storage,
        id("pract-saver"),
        "saver@example.com",
      );
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);
      await routines.createDraft({
        id: id("routine-community"),
        draftVersionId: id("rv-comm-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("rvr-comm"),
        routineId: id("routine-community"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const v1 = await versions.publishDraft({
        routineId: id("routine-community"),
        authorId: author,
        publishedAt: TS,
        name: "Community knee",
      });
      const copy = await my.saveFrozenCopy({
        id: id("pr-copy"),
        practitionerId: saver,
        routineId: id("routine-community"),
        sourceRoutineVersionId: v1.id,
        sourceVersionNumber: 1,
        savedAt: TS,
        rows: [
          {
            id: id("prr-copy"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      await versions.savePublishedVersion({
        id: id("rv-comm-v2"),
        routineId: id("routine-community"),
        createdBy: author,
        createdAt: TS,
        name: "Community knee v2",
        changeSummary: "Tweaked hold",
        copyFromVersionId: v1.id,
      });
      const routineAfter = await routines.findById(id("routine-community"));
      expect(routineAfter?.published_version).toBe(2);
      expect(copy.source_version_number).toBe(1);
      const copyRows = await new PractitionerRoutineRowsRepository(storage).listForCopy(
        copy.id,
      );
      expect(copyRows[0]?.params_json).toContain('"hold_s":30');
      expect(
        my.hasCommunityUpdateFlag(copy, routineAfter!),
        "mutant: flag must compare published_version to frozen source_version_number",
      ).toBe(true);
    } finally {
      storage.close();
    }
  });
});

describe("program routine origin (repository, SQLite)", () => {
  it("records origin trio on create and rejects partial origin updates", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const author = practitionerId;
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const programs = new ProgramsRepository(storage);

      await routines.createDraft({
        id: id("routine-origin"),
        draftVersionId: id("rv-origin-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("rvr-origin"),
        routineId: id("routine-origin"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("routine-origin"),
        authorId: author,
        publishedAt: TS,
        name: "Origin source",
      });

      const fromRoutine = await programs.create({
        id: id("prog-from-routine"),
        createdBy: practitionerId,
        createdAt: TS,
        routineOrigin: {
          routineId: id("routine-origin"),
          routineVersionId: published.id,
          origin: "used_as_is",
        },
      });
      expect(fromRoutine.source_routine_id).toBe(id("routine-origin"));
      expect(fromRoutine.source_routine_version_id).toBe(published.id);
      expect(fromRoutine.source_routine_origin).toBe("used_as_is");

      const scratch = await programs.create({
        id: id("prog-scratch"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      expect(scratch.source_routine_id).toBeNull();
      expect(scratch.source_routine_version_id).toBeNull();
      expect(scratch.source_routine_origin).toBeNull();

      await programs.setRoutineOrigin(id("prog-scratch"), {
        routineId: id("routine-origin"),
        routineVersionId: published.id,
        usedAs: "tweaked",
      });
      const updated = await programs.findById(id("prog-scratch"));
      expect(updated?.source_routine_origin).toBe("tweaked");

      expect(() =>
        validateProgramRoutineOriginTrio({
          sourceRoutineId: id("routine-origin"),
          sourceRoutineVersionId: null,
          sourceRoutineOrigin: "used_as_is",
        }),
      ).toThrow(RoutineRepositoryError);
    } finally {
      storage.close();
    }
  });

  it("leaves program origin unchanged when community routine version advances", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const programs = new ProgramsRepository(storage);
      await routines.createDraft({
        id: id("routine-prog-origin"),
        draftVersionId: id("rv-prog-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("rvr-prog"),
        routineId: id("routine-prog-origin"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 20, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const v1 = await versions.publishDraft({
        routineId: id("routine-prog-origin"),
        authorId: author,
        publishedAt: TS,
        name: "Origin routine",
      });
      const program = await programs.create({
        id: id("prog-origin-pin"),
        createdBy: author,
        createdAt: TS,
        routineOrigin: {
          routineId: id("routine-prog-origin"),
          routineVersionId: v1.id,
          origin: "used_as_is",
        },
      });
      await versions.savePublishedVersion({
        id: id("rv-prog-v2"),
        routineId: id("routine-prog-origin"),
        createdBy: author,
        createdAt: TS,
        name: "Origin routine v2",
        copyFromVersionId: v1.id,
      });
      const reloaded = await programs.findById(program.id);
      expect(reloaded?.source_routine_version_id).toBe(v1.id);
      expect(reloaded?.source_routine_origin).toBe("used_as_is");
    } finally {
      storage.close();
    }
  });
});

describe("routine schema constraints (integration, SQLite)", () => {
  it("rejects invalid JSON, duplicate draft, and bad origin enum", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      await storage.run(
        `INSERT INTO routines (
          id, created_by, created_at, condition_id, body_region_id, who_its_for,
          published_version, draft_updated_at
        ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?)`,
        [id("routine-raw"), author, TS, BODY_REGION_KNEE, TS],
      );
      await storage.run(
        `INSERT INTO routine_versions (
          id, routine_id, version_number, status, name, change_summary,
          restored_from_version_id, created_by, created_at
        ) VALUES (?, ?, 0, 'draft', NULL, NULL, NULL, ?, ?)`,
        [id("rv-raw-draft"), id("routine-raw"), author, TS],
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO routine_version_rows (
              id, routine_version_id, position, exercise_id, exercise_version_id,
              prescription_type, params_json
            ) VALUES (?, ?, 0, ?, ?, 'stretching', ?)`,
            [
              id("rvr-bad-json"),
              id("rv-raw-draft"),
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              "not-json",
            ],
          ),
        /malformed JSON|JSON|constraint/i,
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO routine_versions (
              id, routine_id, version_number, status, name, change_summary,
              restored_from_version_id, created_by, created_at
            ) VALUES (?, ?, 0, 'draft', NULL, NULL, NULL, ?, ?)`,
            [id("rv-second-draft"), id("routine-raw"), author, TS],
          ),
        /idx_routine_versions_one_draft_per_routine|UNIQUE constraint failed/i,
      );
      await storage.run(
        `INSERT INTO programs (
          id, code, name, created_by, created_at, draft_version, draft_updated_at
        ) VALUES (?, ?, NULL, ?, ?, 1, ?)`,
        [id("prog-bad-origin"), "PRG-BAD1", author, TS, TS],
      );
      await expectSqliteError(
        () =>
          storage.run(`UPDATE programs SET source_routine_origin = ? WHERE id = ?`, [
            "mutated",
            id("prog-bad-origin"),
          ]),
        /CHECK constraint failed/i,
      );
    } finally {
      storage.close();
    }
  });
});
