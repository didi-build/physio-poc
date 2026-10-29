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
import {
  MIGRATION_0002_SQL,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

const REPO_ROOT = join(import.meta.dirname, "..");

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
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-TEST",
      });
      expect(await programs.findByCode("TEST")).toEqual(created);
      expect(await programs.findByCode("PRG-TEST")).toEqual(created);
      await programs.create({
        id: "prog-2",
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-PRG7",
      });
      expect((await programs.findByCode("PRG7"))?.id).toBe("prog-2");
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
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: "link-1",
        programId: "prog-1",
        createdAt: TS,
        expiresAt: null,
      });
      await expect(
        links.createOpenLink({
          id: "link-2",
          programId: "prog-1",
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
      await defaults.upsertPractitionerDefault("sld-p1", practitionerId, {
        expiresIn: SHARE_LINK_EXPIRES_IN.never,
      });
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      const links = new ShareLinksRepository(storage);
      const link = await links.createOpenLinkForProgram({
        id: "link-1",
        programId: "prog-1",
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
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
        name: "Knee rehab, week 1",
      });
      await rows.replaceRow({
        id: "row-1",
        programId: "prog-1",
        position: 0,
        exerciseId: "ex-1",
        exerciseVersionId: "ver-1",
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const publishedAt = "2026-03-01T00:00:00.000Z";
      await programs.publish("prog-1", publishedAt);
      const afterPublish = await programs.findById("prog-1");
      const snapshotBefore = programs.getPublishedSnapshot(afterPublish!);
      await rows.replaceRow({
        id: "row-1",
        programId: "prog-1",
        position: 0,
        exerciseId: "ex-1",
        exerciseVersionId: "ver-1",
        prescriptionType: "stretching",
        params: { hold_s: 45 },
        textSnapshot: { title: "Heel slide edited" },
        draftUpdatedAt: "2026-03-02T00:00:00.000Z",
      });
      const afterEdit = await programs.findById("prog-1");
      const snapshotAfter = programs.getPublishedSnapshot(afterEdit!);
      expect(snapshotAfter).toEqual(snapshotBefore);
      const draftRows = await rows.listForProgram("prog-1");
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
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await rows.replaceRow({
        id: "row-1",
        programId: "prog-1",
        position: 0,
        exerciseId: "ex-1",
        exerciseVersionId: "ver-1",
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      await rows.replaceRow({
        id: "row-2",
        programId: "prog-1",
        position: 1,
        exerciseId: "ex-1",
        exerciseVersionId: "ver-1",
        prescriptionType: "stretching",
        params: { hold_s: 20 },
        textSnapshot: { title: "Heel slide copy" },
        draftUpdatedAt: TS,
      });
      const listed = await rows.listForProgram("prog-1");
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
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
        name: "Balance plan",
      });
      await links.createOpenLink({
        id: "link-1",
        programId: "prog-1",
        createdAt: TS,
        expiresAt: null,
      });
      const deletedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      await programs.softDelete("prog-1", deletedAt);
      const closed = await links.findOpenByProgramId("prog-1");
      expect(closed).toBeNull();
      const closedRow = await storage.first<{ closed_at: string | null }>(
        "SELECT closed_at FROM share_links WHERE id = ? LIMIT 1",
        ["link-1"],
      );
      expect(closedRow?.closed_at).toBe(deletedAt);
      await programs.restore("prog-1");
      expect((await programs.findById("prog-1"))?.deleted_at).toBeNull();
      expect(await links.findOpenByProgramId("prog-1")).toBeNull();
      await programs.softDelete("prog-1", "2020-01-01T00:00:00.000Z");
      const purgeNow = new Date("2020-02-15T00:00:00.000Z");
      const purgeable = await programs.listPurgeableDeleted(purgeNow);
      expect(purgeable.map((p) => p.id)).toContain("prog-1");
      await programs.purgeDeleted("prog-1", purgeNow);
      expect(await programs.findById("prog-1")).toBeNull();
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
