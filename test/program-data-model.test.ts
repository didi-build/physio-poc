import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  generateProgramCode,
  isValidProgramCodeFormat,
  normalizeProgramCode,
} from "../src/domain/program-code.js";
import { generateShareLinkToken } from "../src/domain/share-link-token.js";
import {
  GLOBAL_SHARE_LINK_DEFAULT_EXPIRES_IN,
  resolveShareLinkExpiresAt,
  validateCustomLinkExpiryDate,
} from "../src/domain/share-link-expiry.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import {
  ProgramRepositoryError,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinkDefaultsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  MIGRATION_0002_SQL,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const BODY_REGION_KNEE = "br-knee";

describe("program data model migration (integration, SQLite)", () => {
  it("0002 migration SQL has no BEGIN or COMMIT", () => {
    expect(MIGRATION_0002_SQL).not.toMatch(/\bBEGIN\b/);
    expect(MIGRATION_0002_SQL).not.toMatch(/\bCOMMIT\b/);
  });

  it("seeds global share link default of 1 year", async () => {
    const storage = await openMigratedDatabase();
    try {
      const defaults = new ShareLinkDefaultsRepository(storage);
      const global = await defaults.getGlobalDefault();
      expect(global.expiresIn).toBe(GLOBAL_SHARE_LINK_DEFAULT_EXPIRES_IN);
      expect(global.expiresIn).toBe(SHARE_LINK_EXPIRES_IN.one_year);
    } finally {
      storage.close();
    }
  });
});

describe("program codes (unit + repository)", () => {
  it("generates PRG- codes with valid format", () => {
    const code = generateProgramCode();
    expect(code.startsWith("PRG-")).toBe(true);
    expect(isValidProgramCodeFormat(code)).toBe(true);
  });

  it("normalizes codes with or without prefix", () => {
    expect(normalizeProgramCode("7k3q")).toBe("PRG-7K3Q");
    expect(normalizeProgramCode("PRG-7K3Q")).toBe("PRG-7K3Q");
    expect(normalizeProgramCode("prg7k3q")).toBe("PRG-7K3Q");
  });

  it("finds programs by code with or without prefix", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const created = await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-TEST",
      });
      expect(await programs.findByCode("TEST")).toEqual(created);
      expect(await programs.findByCode("PRG-TEST")).toEqual(created);
      await programs.create({
        id: id("prog-2"),
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-PRG7",
      });
      expect((await programs.findByCode("PRG7"))?.id).toBe(id("prog-2"));
    } finally {
      storage.close();
    }
  });
});

describe("share links and expiry (repository, SQLite)", () => {
  it("allows never and custom dates from tomorrow in America/Toronto", () => {
    const now = new Date("2026-10-30T00:30:00.000Z");
    expect(validateCustomLinkExpiryDate("2026-10-30", now)).toBe("2026-10-30");
    expect(() => validateCustomLinkExpiryDate("2026-10-29", now)).toThrow();
    const neverAt = resolveShareLinkExpiresAt(
      { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      now,
    );
    expect(neverAt).toBeNull();
  });

  it("enforces at most one open share link per program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: id("link-1"),
        programId: id("prog-1"),
        createdAt: TS,
        expiresAt: null,
      });
      await expect(
        links.createOpenLink({
          id: id("link-2"),
          programId: id("prog-1"),
          createdAt: TS,
          expiresAt: null,
        }),
      ).rejects.toThrow(ProgramRepositoryError);
    } finally {
      storage.close();
    }
  });

  it("uses practitioner default then global 1 year for new links", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const defaults = new ShareLinkDefaultsRepository(storage);
      await defaults.upsertPractitionerDefault(id("sld-p1"), practitionerId, {
        expiresIn: SHARE_LINK_EXPIRES_IN.never,
      });
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const links = new ShareLinksRepository(storage);
      const link = await links.createOpenLinkForProgram({
        id: id("link-1"),
        programId: id("prog-1"),
        practitionerId,
        createdAt: TS,
        now: new Date("2026-03-01T00:00:00.000Z"),
      });
      expect(link.expires_at).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("generates unguessable share tokens with Web Crypto", () => {
    const a = generateShareLinkToken();
    const b = generateShareLinkToken();
    expect(a.length).toBeGreaterThan(20);
    expect(a).not.toBe(b);
  });
});

describe("publish snapshots and delete or restore (repository, SQLite)", () => {
  it("keeps published snapshot unchanged when draft rows edit", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Knee rehab, week 1",
      });
      await rows.replaceRow({
        id: id("row-1"),
        programId: id("prog-1"),
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const publishedAt = "2026-03-01T00:00:00.000Z";
      await programs.publish(id("prog-1"), publishedAt);
      const afterPublish = await programs.findById(id("prog-1"));
      const snapshotBefore = programs.getPublishedSnapshot(afterPublish!);
      await rows.replaceRow({
        id: id("row-1"),
        programId: id("prog-1"),
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 45 },
        textSnapshot: { title: "Heel slide edited" },
        draftUpdatedAt: "2026-03-02T00:00:00.000Z",
      });
      const afterEdit = await programs.findById(id("prog-1"));
      const snapshotAfter = programs.getPublishedSnapshot(afterEdit!);
      expect(snapshotAfter).toEqual(snapshotBefore);
      const draftRows = await rows.listForProgram(id("prog-1"));
      expect(draftRows[0]?.params_json).toContain("45");
    } finally {
      storage.close();
    }
  });

  it("allows duplicate exercises at different positions", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await rows.replaceRow({
        id: id("row-1"),
        programId: id("prog-1"),
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      await rows.replaceRow({
        id: id("row-2"),
        programId: id("prog-1"),
        position: 1,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 20 },
        textSnapshot: { title: "Heel slide copy" },
        draftUpdatedAt: TS,
      });
      const listed = await rows.listForProgram(id("prog-1"));
      expect(listed).toHaveLength(2);
    } finally {
      storage.close();
    }
  });

  it("soft deletes, closes open links, restores within 30 days, and purges after", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Balance plan",
      });
      await links.createOpenLink({
        id: id("link-1"),
        programId: id("prog-1"),
        createdAt: TS,
        expiresAt: null,
      });
      const deletedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      await programs.softDelete(id("prog-1"), deletedAt);
      const closed = await links.findOpenByProgramId(id("prog-1"));
      expect(closed).toBeNull();
      const closedRow = await storage.first<{ closed_at: string | null }>(
        "SELECT closed_at FROM share_links WHERE id = ? LIMIT 1",
        [id("link-1")],
      );
      expect(closedRow?.closed_at).toBe(deletedAt);
      await programs.restore(id("prog-1"));
      expect((await programs.findById(id("prog-1")))?.deleted_at).toBeNull();
      expect(await links.findOpenByProgramId(id("prog-1"))).toBeNull();
      await programs.softDelete(id("prog-1"), "2020-01-01T00:00:00.000Z");
      const purgeNow = new Date("2020-02-15T00:00:00.000Z");
      const purgeable = await programs.listPurgeableDeleted(purgeNow);
      expect(purgeable.map((p) => p.id)).toContain(id("prog-1"));
      await programs.purgeDeleted(id("prog-1"), purgeNow);
      expect(await programs.findById(id("prog-1"))).toBeNull();
    } finally {
      storage.close();
    }
  });
});

describe("ProgramsRepository listForPractitioner", () => {
  it("returns records that deep-equal findById including routine origin fields", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const programs = new ProgramsRepository(storage);

      await routines.createDraft({
        id: id("routine-list-eq"),
        draftVersionId: id("rv-list-eq-draft"),
        createdBy: practitionerId,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("rvr-list-eq"),
        routineId: id("routine-list-eq"),
        authorId: practitionerId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("routine-list-eq"),
        authorId: practitionerId,
        publishedAt: TS,
        name: "List parity routine",
      });

      const created = await programs.create({
        id: id("prog-list-eq"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Program with origin",
        routineOrigin: {
          routineId: id("routine-list-eq"),
          routineVersionId: published.id,
          origin: "used_as_is",
        },
      });

      const listed = await programs.listForPractitioner({ practitionerId });
      const fromList = listed.find((row) => row.id === created.id);
      expect(fromList).toBeDefined();
      expect(fromList).toEqual(await programs.findById(created.id));
      expect(fromList?.source_routine_id).toBe(id("routine-list-eq"));
      expect(fromList?.source_routine_version_id).toBe(published.id);
      expect(fromList?.source_routine_origin).toBe("used_as_is");
    } finally {
      storage.close();
    }
  });

  it("returns each listed program deep-equal to findById for the same id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-list-parity-a"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Alpha",
      });
      await programs.create({
        id: id("prog-list-parity-b"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Beta",
      });
      const listed = await programs.listForPractitioner({ practitionerId });
      expect(listed.length).toBeGreaterThanOrEqual(2);
      for (const record of listed) {
        expect(record).toEqual(await programs.findById(record.id));
      }
    } finally {
      storage.close();
    }
  });
});

describe("ProgramsRepository listForPractitioner draft order (M20)", () => {
  it("orders by draft_updated_at descending (most recent first)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const service = new ProgramBuilderService(storage);

      await programs.create({
        id: id("prog-list-old"),
        createdBy: practitionerId,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      await programs.create({
        id: id("prog-list-mid"),
        createdBy: practitionerId,
        createdAt: "2026-01-02T00:00:00.000Z",
      });
      await programs.create({
        id: id("prog-list-new"),
        createdBy: practitionerId,
        createdAt: "2026-01-03T00:00:00.000Z",
      });
      await programs.touchDraft(id("prog-list-old"), "2026-01-01T12:00:00.000Z");
      await programs.touchDraft(id("prog-list-mid"), "2026-01-02T12:00:00.000Z");
      await programs.touchDraft(id("prog-list-new"), "2026-01-03T12:00:00.000Z");

      const expectedOrder = [
        id("prog-list-new"),
        id("prog-list-mid"),
        id("prog-list-old"),
      ];

      const listed = await programs.listForPractitioner({ practitionerId });
      expect(listed.map((row) => row.id)).toEqual(expectedOrder);

      const fromService = await service.listPrograms(practitionerId);
      expect(fromService.items.map((item) => item.program_id)).toEqual(expectedOrder);
    } finally {
      storage.close();
    }
  });
});

describe("program migration FK conventions", () => {
  it("defines ON DELETE RESTRICT on program model foreign keys", async () => {
    const storage = await openMigratedDatabase();
    try {
      const tables = ["programs", "program_rows", "share_links", "share_link_defaults"];
      for (const name of tables) {
        const row = await storage.first<{ sql: string }>(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
          [name],
        );
        const sql = row?.sql ?? "";
        const fkCount = (sql.match(/REFERENCES/gi) ?? []).length;
        const restrictCount = (sql.match(/ON DELETE RESTRICT/gi) ?? []).length;
        expect(restrictCount).toBe(fkCount);
      }
    } finally {
      storage.close();
    }
  });
});

describe("program migration idempotency", () => {
  it("applyMigration source still avoids d1_migrations", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src/storage/migrations/apply.ts"),
      "utf8",
    );
    expect(source.includes("d1_migrations")).toBe(false);
  });
});
