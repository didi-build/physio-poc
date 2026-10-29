import { afterEach, describe, expect, it, vi } from "vitest";
import * as programCodeDomain from "../src/domain/program-code.js";
import {
  isValidProgramCodeFormat,
  programCodeSearchKeys,
} from "../src/domain/program-code.js";
import {
  FreeTextValidationError,
  validateProgramName,
  validateProgramRowNote,
} from "../src/domain/exercise-free-text.js";
import {
  resolveOneYearExpiresAt,
  resolveShareLinkExpiresAt,
  validateCustomLinkExpiryDate,
} from "../src/domain/share-link-expiry.js";
import { torontoEndOfDayUtcIso } from "../src/domain/toronto-calendar.js";
import {
  encodeShareLinkTokenFromBytes,
  generateShareLinkToken,
  SHARE_LINK_TOKEN_BYTE_LENGTH,
  SHARE_LINK_TOKEN_CHAR_LENGTH,
} from "../src/domain/share-link-token.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import {
  PROGRAM_RESTORE_AND_PURGE_WINDOW_MS,
  ProgramRepositoryError,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

const MS_DAY = 24 * 60 * 60 * 1000;

describe("DIDI-1000 QA round 1 (mutation and boundary coverage)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("finds PRG-PRG7 by PRG7 and does not throw on PRGA search keys", async () => {
    expect(programCodeSearchKeys("PRG7")).toContain("PRG-PRG7");
    expect(() => programCodeSearchKeys("PRGA")).not.toThrow();
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: "prog-prg7",
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-PRG7",
      });
      expect(await programs.findByCode("PRG7")).not.toBeNull();
      expect(await programs.findByCode("PRGA")).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid program code format including PRGA on create", async () => {
    expect(isValidProgramCodeFormat("PRG-A")).toBe(false);
    expect(isValidProgramCodeFormat("PRG-7K3Q")).toBe(true);
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.create({
          id: "prog-bad",
          createdBy: practitionerId,
          createdAt: TS,
          code: "PRGA",
        }),
      ).rejects.toThrow(ProgramRepositoryError);
    } finally {
      storage.close();
    }
  });

  it("retries program code allocation on unique index collision", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await storage.run(
        `INSERT INTO programs (
          id, code, name, created_by, created_at, draft_version, draft_updated_at
        ) VALUES (?, ?, NULL, ?, ?, 1, ?)`,
        ["prog-existing", "PRG-C001", practitionerId, TS, TS],
      );
      const spy = vi
        .spyOn(programCodeDomain, "generateProgramCode")
        .mockReturnValueOnce("PRG-C001")
        .mockReturnValueOnce("PRG-C002");
      const programs = new ProgramsRepository(storage);
      const created = await programs.create({
        id: "prog-new",
        createdBy: practitionerId,
        createdAt: TS,
      });
      expect(created.code).toBe("PRG-C002");
      spy.mockRestore();
    } finally {
      storage.close();
    }
  });

  it("uses exact 43 char tokens from 32 CSPRNG bytes, not Math.random", () => {
    const randomSpy = vi.spyOn(Math, "random");
    const getRandomValuesSpy = vi.spyOn(crypto, "getRandomValues");
    const token = generateShareLinkToken();
    expect(token.length).toBe(SHARE_LINK_TOKEN_CHAR_LENGTH);
    expect(getRandomValuesSpy).toHaveBeenCalled();
    expect(randomSpy).not.toHaveBeenCalled();
    const fixed = encodeShareLinkTokenFromBytes(
      new Uint8Array(SHARE_LINK_TOKEN_BYTE_LENGTH).fill(1),
    );
    expect(fixed.length).toBe(SHARE_LINK_TOKEN_CHAR_LENGTH);
    randomSpy.mockRestore();
    getRandomValuesSpy.mockRestore();
  });

  it("resolves one year expiry at Toronto end of day 365 calendar days out", () => {
    const now = new Date("2026-03-01T15:00:00.000Z");
    const expiresAt = resolveOneYearExpiresAt(now);
    expect(expiresAt).toBe(
      resolveShareLinkExpiresAt({ expiresIn: SHARE_LINK_EXPIRES_IN.one_year }, now),
    );
    expect(expiresAt.endsWith(".999Z")).toBe(true);
    expect(expiresAt).not.toBe(new Date(now.getTime() + 364 * MS_DAY).toISOString());
  });

  it("validates custom expiry using America/Toronto between 8 PM and midnight ET", () => {
    const now = new Date("2026-10-30T00:30:00.000Z");
    expect(validateCustomLinkExpiryDate("2026-10-30", now)).toBe("2026-10-30");
    expect(() => validateCustomLinkExpiryDate("2026-02-30", now)).toThrow();
    const endIso = torontoEndOfDayUtcIso("2026-10-30");
    expect(new Date(endIso).getTime()).toBeGreaterThan(now.getTime());
  });

  it("rejects publish without a name or when deleted", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(programs.publish("prog-1", TS)).rejects.toThrow(
        FreeTextValidationError,
      );
      await programs.updateDraftName("prog-1", "Named plan");
      await programs.softDelete("prog-1", TS);
      await expect(programs.publish("prog-1", TS)).rejects.toThrow(
        ProgramRepositoryError,
      );
    } finally {
      storage.close();
    }
  });

  it("keeps published snapshot on draft edit and updates on republish", async () => {
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
        name: "Plan A",
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
      await programs.publish("prog-1", TS);
      const afterFirst = await programs.findById("prog-1");
      const snap1 = programs.getPublishedSnapshot(afterFirst!);
      await programs.updateDraftName("prog-1", "Plan B");
      await rows.replaceRow({
        id: "row-1",
        programId: "prog-1",
        position: 0,
        exerciseId: "ex-1",
        exerciseVersionId: "ver-1",
        prescriptionType: "stretching",
        params: { hold_s: 99 },
        textSnapshot: { title: "Heel slide changed" },
        draftUpdatedAt: TS,
      });
      const mid = await programs.findById("prog-1");
      expect(programs.getPublishedSnapshot(mid!)?.name).toBe("Plan A");
      await programs.publish("prog-1", "2026-03-02T00:00:00.000Z");
      const afterSecond = await programs.findById("prog-1");
      const snap2 = programs.getPublishedSnapshot(afterSecond!);
      expect(snap2?.name).toBe("Plan B");
      expect(snap2?.rows[0]?.params).toEqual({ hold_s: 99 });
      expect(snap1?.rows[0]?.params).toEqual({ hold_s: 30 });
    } finally {
      storage.close();
    }
  });

  it("enforces restore window at 6, 30 and 31 days", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      const now = new Date("2026-06-01T12:00:00.000Z");
      for (const days of [6, 30]) {
        await storage.run(`UPDATE programs SET deleted_at = NULL WHERE id = ?`, [
          "prog-1",
        ]);
        const deletedAt = new Date(now.getTime() - days * MS_DAY).toISOString();
        await programs.softDelete("prog-1", deletedAt);
        await expect(programs.restore("prog-1", now)).resolves.toBeUndefined();
      }
      await storage.run(`UPDATE programs SET deleted_at = NULL WHERE id = ?`, [
        "prog-1",
      ]);
      const deleted31 = new Date(now.getTime() - 31 * MS_DAY).toISOString();
      await programs.softDelete("prog-1", deleted31);
      await expect(programs.restore("prog-1", now)).rejects.toThrow(
        ProgramRepositoryError,
      );
    } finally {
      storage.close();
    }
  });

  it("purges only programs deleted more than 30 days ago", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: "prog-live",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await programs.create({
        id: "prog-old",
        createdBy: practitionerId,
        createdAt: TS,
      });
      const now = new Date("2026-06-01T00:00:00.000Z");
      const cutoff = new Date(now.getTime() - PROGRAM_RESTORE_AND_PURGE_WINDOW_MS);
      const justInside = new Date(cutoff.getTime() + 1000).toISOString();
      const justOutside = new Date(cutoff.getTime() - 1000).toISOString();
      await programs.softDelete("prog-live", justInside);
      await programs.softDelete("prog-old", justOutside);
      const purgeable = await programs.listPurgeableDeleted(now);
      expect(purgeable.map((p) => p.id)).toEqual(["prog-old"]);
      await programs.purgeDeleted("prog-live", now);
      expect(await programs.findById("prog-live")).not.toBeNull();
      await programs.purgeDeleted("prog-old", now);
      expect(await programs.findById("prog-old")).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects share links for deleted programs and allows reopen after close", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      await programs.create({
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await links.createOpenLink({
        id: "link-1",
        programId: "prog-1",
        createdAt: TS,
        expiresAt: null,
      });
      await links.closeOpenLinksForProgram("prog-1", TS);
      await links.createOpenLink({
        id: "link-2",
        programId: "prog-1",
        createdAt: TS,
        expiresAt: null,
      });
      await programs.softDelete("prog-1", TS);
      await expect(
        links.createOpenLink({
          id: "link-3",
          programId: "prog-1",
          createdAt: TS,
          expiresAt: null,
        }),
      ).rejects.toThrow(ProgramRepositoryError);
      await expect(
        links.createOpenLinkForProgram({
          id: "link-4",
          programId: "prog-1",
          practitionerId,
          createdAt: TS,
        }),
      ).rejects.toThrow(ProgramRepositoryError);
    } finally {
      storage.close();
    }
  });

  it("races concurrent createOpenLink and keeps one open link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      await programs.create({
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      const results = await Promise.allSettled([
        links.createOpenLink({
          id: "link-a",
          programId: "prog-1",
          createdAt: TS,
          expiresAt: null,
        }),
        links.createOpenLink({
          id: "link-b",
          programId: "prog-1",
          createdAt: TS,
          expiresAt: null,
        }),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const open = await storage.all<{ id: string }>(
        "SELECT id FROM share_links WHERE program_id = ? AND closed_at IS NULL",
        ["prog-1"],
      );
      expect(open).toHaveLength(1);
    } finally {
      storage.close();
    }
  });

  it("validates program name, row note and text snapshot at call sites", async () => {
    expect(() => validateProgramName("  ")).toThrow(FreeTextValidationError);
    expect(() => validateProgramRowNote("x".repeat(301))).toThrow(
      FreeTextValidationError,
    );
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await expect(
        programs.create({
          id: "prog-bad-name",
          createdBy: practitionerId,
          createdAt: TS,
          name: "coach@example.com",
        }),
      ).rejects.toThrow(FreeTextValidationError);
      await programs.create({
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        rows.replaceRow({
          id: "row-1",
          programId: "prog-1",
          position: 0,
          exerciseId: "ex-1",
          exerciseVersionId: "ver-1",
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Reach coach@example.com" },
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      await programs.softDelete("prog-1", TS);
      await expect(
        rows.replaceRow({
          id: "row-2",
          programId: "prog-1",
          position: 0,
          exerciseId: "ex-1",
          exerciseVersionId: "ver-1",
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Heel slide" },
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow(ProgramRepositoryError);
    } finally {
      storage.close();
    }
  });

  it("updates open link expiry immediately when setLinkExpiry changes", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      await programs.create({
        id: "prog-1",
        createdBy: practitionerId,
        createdAt: TS,
      });
      const now = new Date("2026-04-01T12:00:00.000Z");
      await links.createOpenLinkForProgram({
        id: "link-1",
        programId: "prog-1",
        practitionerId,
        createdAt: TS,
        now,
      });
      const before = await links.findOpenByProgramId("prog-1");
      await programs.setLinkExpiry(
        "prog-1",
        { expiresIn: SHARE_LINK_EXPIRES_IN.never },
        now,
      );
      const after = await links.findOpenByProgramId("prog-1");
      expect(after?.expires_at).toBeNull();
      expect(before?.expires_at).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("schema CHECK and json_valid constraints reject bad raw SQL", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `INSERT INTO programs (
          id, code, name, created_by, created_at, draft_version, draft_updated_at
        ) VALUES (?, ?, NULL, ?, ?, 1, ?)`,
        ["prog-raw", "PRG-RAW1", practitionerId, TS, TS],
      );
      await expect(
        storage.run(
          `INSERT INTO program_rows (
            id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
            prescription_type, params_json, text_snapshot_json, note
          ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            "row-bad",
            "prog-raw",
            "ex-1",
            "ver-1",
            null,
            "stretching",
            "not-json",
            '{"title":"Ok"}',
          ],
        ),
      ).rejects.toThrow();
      await expect(
        storage.run(
          `INSERT INTO program_rows (
            id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
            prescription_type, params_json, text_snapshot_json, note
          ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            "row-placeholder-bad",
            "prog-raw",
            "ex-1",
            "ver-1",
            "req-1",
            "stretching",
            '{"hold_s":30}',
            '{"title":"Ok"}',
          ],
        ),
      ).rejects.toThrow();
      await expect(
        storage.run(`UPDATE programs SET published_snapshot_json = ? WHERE id = ?`, [
          "{not-json",
          "prog-raw",
        ]),
      ).rejects.toThrow();
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, NULL, NULL, ?)`,
        ["link-open-1", "prog-raw", "token-a", TS],
      );
      await expect(
        storage.run(
          `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
           VALUES (?, ?, ?, NULL, NULL, ?)`,
          ["link-open-2", "prog-raw", "token-b", TS],
        ),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("defines programs.code unique index and one-open-link partial unique index", async () => {
    const storage = await openMigratedDatabase();
    try {
      const codeIdx = await storage.first<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1",
        ["idx_programs_code"],
      );
      const openIdx = await storage.first<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1",
        ["idx_share_links_one_open_per_program"],
      );
      expect(codeIdx?.name).toBe("idx_programs_code");
      expect(openIdx?.name).toBe("idx_share_links_one_open_per_program");
    } finally {
      storage.close();
    }
  });
});
