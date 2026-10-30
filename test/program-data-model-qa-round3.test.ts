import { describe, expect, it } from "vitest";
import {
  MAX_LENGTH_PROGRAM_TITLE,
  MAX_LENGTH_ROW_NOTES,
} from "../src/mcp-connector/text-limits.js";
import {
  addTorontoCalendarDays,
  SHARE_LINK_EXPIRY_TIME_ZONE,
  torontoDateOnlyFromInstant,
  torontoEndOfDayUtcIso,
} from "../src/domain/toronto-calendar.js";
import {
  resolveShareLinkExpiresAt,
  ShareLinkExpiryValidationError,
  validateCustomLinkExpiryDate,
} from "../src/domain/share-link-expiry.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import {
  FreeTextValidationError,
  validateProgramName,
} from "../src/domain/exercise-free-text.js";
import { isValidProgramCodeFormat } from "../src/domain/program-code.js";
import {
  PROGRAM_RESTORE_AND_PURGE_WINDOW_MS,
  ProgramRepositoryError,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

function expectSqliteMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function expectSqliteError(
  run: () => Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await expect(run()).rejects.toSatisfy((error: unknown) =>
    pattern.test(expectSqliteMessage(error)),
  );
}

describe("DIDI-1000 QA round 3", () => {
  it("resolves preset expiry to Toronto end-of-day instants", () => {
    // Toronto end of day is the last millisecond before the next Toronto calendar day
    // (03:59:59.999Z when EDT, 04:59:59.999Z when EST).
    const cases: {
      nowIso: string;
      oneWeek: string;
      ninetyDays: string;
      oneYear: string;
    }[] = [
      {
        nowIso: "2026-03-01T15:00:00.000Z",
        oneWeek: "2026-03-09T03:59:59.999Z",
        ninetyDays: "2026-05-31T03:59:59.999Z",
        oneYear: "2027-03-02T04:59:59.999Z",
      },
      {
        nowIso: "2026-03-07T23:00:00.000Z",
        oneWeek: "2026-03-15T03:59:59.999Z",
        ninetyDays: "2026-06-06T03:59:59.999Z",
        oneYear: "2027-03-08T04:59:59.999Z",
      },
      {
        nowIso: "2026-03-08T12:00:00.000Z",
        oneWeek: "2026-03-16T03:59:59.999Z",
        ninetyDays: "2026-06-07T03:59:59.999Z",
        oneYear: "2027-03-09T04:59:59.999Z",
      },
      {
        nowIso: "2026-10-31T23:00:00.000Z",
        oneWeek: "2026-11-08T04:59:59.999Z",
        ninetyDays: "2027-01-30T04:59:59.999Z",
        oneYear: "2027-11-01T03:59:59.999Z",
      },
      {
        nowIso: "2026-11-01T12:00:00.000Z",
        oneWeek: "2026-11-09T04:59:59.999Z",
        ninetyDays: "2027-01-31T04:59:59.999Z",
        oneYear: "2027-11-02T03:59:59.999Z",
      },
      {
        nowIso: "2026-12-31T23:30:00.000Z",
        oneWeek: "2027-01-08T04:59:59.999Z",
        ninetyDays: "2027-04-01T03:59:59.999Z",
        oneYear: "2028-01-01T04:59:59.999Z",
      },
    ];
    for (const c of cases) {
      const now = new Date(c.nowIso);
      expect(
        resolveShareLinkExpiresAt({ expiresIn: SHARE_LINK_EXPIRES_IN.one_week }, now),
      ).toBe(c.oneWeek);
      expect(
        resolveShareLinkExpiresAt(
          { expiresIn: SHARE_LINK_EXPIRES_IN.ninety_days },
          now,
        ),
      ).toBe(c.ninetyDays);
      expect(
        resolveShareLinkExpiresAt({ expiresIn: SHARE_LINK_EXPIRES_IN.one_year }, now),
      ).toBe(c.oneYear);
    }
  });

  it("uses America/Toronto for expiry calendar", () => {
    expect(SHARE_LINK_EXPIRY_TIME_ZONE).toBe("America/Toronto");
  });

  it("resolves one year at Toronto end of day 365 days out, not 364", () => {
    const now = new Date("2026-03-01T15:00:00.000Z");
    const today = torontoDateOnlyFromInstant(now);
    const expected = torontoEndOfDayUtcIso(addTorontoCalendarDays(today, 365));
    const actual = resolveShareLinkExpiresAt(
      { expiresIn: SHARE_LINK_EXPIRES_IN.one_year },
      now,
    );
    expect(actual).toBe(expected);
    expect(actual).not.toBe(torontoEndOfDayUtcIso(addTorontoCalendarDays(today, 364)));
  });

  it("rejects future impossible dates via round-trip, not past-date shortcut", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    expect(() => validateCustomLinkExpiryDate("2027-02-30", now)).toThrow(
      ShareLinkExpiryValidationError,
    );
    expect(() => validateCustomLinkExpiryDate("2026-2-30", now)).toThrow(
      ShareLinkExpiryValidationError,
    );
  });

  it("end of day respects short and long Toronto days", () => {
    const shortDayEnd = torontoEndOfDayUtcIso("2026-03-08");
    const longDayEnd = torontoEndOfDayUtcIso("2026-11-01");
    const shortStart = torontoEndOfDayUtcIso("2026-03-07");
    const longStart = torontoEndOfDayUtcIso("2026-10-31");
    expect(
      new Date(shortDayEnd).getTime() - new Date(shortStart).getTime(),
    ).toBeLessThan(26 * 60 * 60 * 1000);
    expect(
      new Date(longDayEnd).getTime() - new Date(longStart).getTime(),
    ).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it("keeps published_name frozen until republish", async () => {
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
        name: "Published name",
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
      await programs.publish(id("prog-1"), TS);
      await programs.updateDraftName(id("prog-1"), "Draft only name");
      const row = await storage.first<{
        published_name: string | null;
        name: string | null;
      }>("SELECT published_name, name FROM programs WHERE id = ? LIMIT 1", [
        id("prog-1"),
      ]);
      expect(row?.published_name).toBe("Published name");
      expect(row?.name).toBe("Draft only name");
    } finally {
      storage.close();
    }
  });

  it("listPurgeableDeleted uses strict less-than cutoff and skips live programs", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-live"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await programs.create({
        id: id("prog-edge"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await programs.create({
        id: id("prog-purgeable"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const now = new Date("2026-06-01T00:00:00.000Z");
      const cutoffMs = now.getTime() - PROGRAM_RESTORE_AND_PURGE_WINDOW_MS;
      await programs.softDelete(id("prog-edge"), new Date(cutoffMs).toISOString());
      const purgeable = await programs.listPurgeableDeleted(now);
      expect(purgeable.map((p) => p.id)).not.toContain(id("prog-edge"));
      expect(purgeable.map((p) => p.id)).not.toContain(id("prog-live"));
      await programs.softDelete(
        id("prog-purgeable"),
        new Date(cutoffMs - 1000).toISOString(),
      );
      expect((await programs.listPurgeableDeleted(now)).map((p) => p.id)).toContain(
        id("prog-purgeable"),
      );
    } finally {
      storage.close();
    }
  });

  it("purgeDeleted leaves a live program rows and links intact", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      const links = new ShareLinksRepository(storage);
      await programs.create({
        id: id("prog-live"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await rows.replaceRow({
        id: id("row-live"),
        programId: id("prog-live"),
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      await links.createOpenLink({
        id: id("link-live"),
        programId: id("prog-live"),
        createdAt: TS,
        expiresAt: null,
      });
      const now = new Date("2026-06-01T00:00:00.000Z");
      await programs.purgeDeleted(id("prog-live"), now);
      expect(await programs.findById(id("prog-live"))).not.toBeNull();
      expect(
        (
          await storage.all<{ id: string }>(
            "SELECT id FROM program_rows WHERE program_id = ?",
            [id("prog-live")],
          )
        ).length,
      ).toBe(1);
      expect(await links.findOpenByProgramId(id("prog-live"))).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("validates program name length and patient details on rename", async () => {
    expect(() => validateProgramName("x".repeat(MAX_LENGTH_PROGRAM_TITLE + 1))).toThrow(
      FreeTextValidationError,
    );
    expect(isValidProgramCodeFormat("PRG-!!!!")).toBe(false);
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Ok name",
      });
      await expect(
        programs.updateDraftName(id("prog-1"), "coach@example.com"),
      ).rejects.toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });

  it("validates row notes and text snapshot fields in replaceRow", async () => {
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
      await expect(
        rows.replaceRow({
          id: id("row-1"),
          programId: id("prog-1"),
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: {
            title: "Heel slide",
            description: "coach@example.com",
          },
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      await expect(
        rows.replaceRow({
          id: id("row-2"),
          programId: id("prog-1"),
          position: 1,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Heel slide", cue: "coach@example.com" },
          note: "coach@example.com",
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      await expect(
        rows.replaceRow({
          id: id("row-3"),
          programId: id("prog-1"),
          position: 2,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Heel slide" },
          note: "x".repeat(MAX_LENGTH_ROW_NOTES + 1),
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      await rows.replaceRow({
        id: id("row-4"),
        programId: id("prog-1"),
        position: 3,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: {
          title: "Heel slide",
          description: "Hold steady",
          cue: "Slow and controlled",
        },
        draftUpdatedAt: TS,
      });
      const stored = await storage.first<{ text_snapshot_json: string }>(
        "SELECT text_snapshot_json FROM program_rows WHERE id = ? LIMIT 1",
        [id("row-4")],
      );
      const parsed = JSON.parse(stored?.text_snapshot_json ?? "{}") as Record<
        string,
        string
      >;
      expect(parsed.description).toBe("Hold steady");
      expect(parsed.cue).toBe("Slow and controlled");
    } finally {
      storage.close();
    }
  });

  it("rejects placeholder rows that also reference an exercise version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, 'open', NULL, ?, ?)`,
        [id("req-1"), "Pending move", practitionerId, TS, TS],
      );
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        rows.replaceRow({
          id: id("row-bad"),
          programId: id("prog-1"),
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          exerciseRequestId: id("req-1"),
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Pending" },
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow(ProgramRepositoryError);
    } finally {
      storage.close();
    }
  });

  it("setLinkExpiry updates only the open link and respects now", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      await programs.create({
        id: id("prog-1"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      const openAt = new Date("2026-04-01T12:00:00.000Z");
      await links.createOpenLinkForProgram({
        id: id("link-open"),
        programId: id("prog-1"),
        practitionerId,
        createdAt: TS,
        now: openAt,
      });
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id("link-closed"), id("prog-1"), "closed-token-value", null, TS, TS],
      );
      const closedBefore = await storage.first<{ expires_at: string | null }>(
        "SELECT expires_at FROM share_links WHERE id = ? LIMIT 1",
        [id("link-closed")],
      );
      const later = new Date("2027-01-01T12:00:00.000Z");
      await programs.setLinkExpiry(
        id("prog-1"),
        {
          expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
          customExpiresOn: "2027-06-15",
        },
        later,
      );
      const closedAfter = await storage.first<{ expires_at: string | null }>(
        "SELECT expires_at FROM share_links WHERE id = ? LIMIT 1",
        [id("link-closed")],
      );
      expect(closedAfter?.expires_at).toBe(closedBefore?.expires_at);
      const open = await links.findOpenByProgramId(id("prog-1"));
      expect(open?.expires_at).toBe(
        resolveShareLinkExpiresAt(
          {
            expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
            customExpiresOn: "2027-06-15",
          },
          later,
        ),
      );
    } finally {
      storage.close();
    }
  });

  it("schema constraints fail with identifiable SQLite errors", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, ?, NULL, ?, 'open', NULL, ?, ?)`,
        [id("req-1"), "Pending move", practitionerId, TS, TS],
      );
      await storage.run(
        `INSERT INTO programs (
          id, code, name, created_by, created_at, draft_version, draft_updated_at
        ) VALUES (?, ?, NULL, ?, ?, 1, ?)`,
        [id("prog-raw"), "PRG-RAW1", practitionerId, TS, TS],
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO program_rows (
              id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
              prescription_type, params_json, text_snapshot_json, note
            ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, NULL)`,
            [
              id("row-bad-params"),
              id("prog-raw"),
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              null,
              "stretching",
              "not-json",
              '{"title":"Ok"}',
            ],
          ),
        /malformed JSON|JSON|constraint/i,
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO program_rows (
              id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
              prescription_type, params_json, text_snapshot_json, note
            ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, NULL)`,
            [
              id("row-bad-placeholder"),
              id("prog-raw"),
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              id("req-1"),
              "stretching",
              '{"hold_s":30}',
              '{"title":"Ok"}',
            ],
          ),
        /CHECK constraint failed/i,
      );
      await storage.run(
        `UPDATE programs SET published_version = 1, published_name = 'Snap', published_at = ?, published_snapshot_json = ? WHERE id = ?`,
        [
          TS,
          JSON.stringify({
            version: 1,
            name: "Snap",
            publishedAt: TS,
            rows: [],
          }),
          id("prog-raw"),
        ],
      );
      await expectSqliteError(
        () =>
          storage.run(`UPDATE programs SET published_snapshot_json = ? WHERE id = ?`, [
            "{not-json",
            id("prog-raw"),
          ]),
        /JSON|constraint/i,
      );
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, NULL, NULL, ?)`,
        [id("link-open-1"), id("prog-raw"), "token-a", TS],
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
             VALUES (?, ?, ?, NULL, NULL, ?)`,
            [id("link-open-2"), id("prog-raw"), "token-b", TS],
          ),
        /idx_share_links_one_open_per_program|UNIQUE constraint failed/i,
      );
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [id("link-token-a"), id("prog-raw"), "dup-token", TS, TS],
      );
      await expectSqliteError(
        () =>
          storage.run(
            `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
             VALUES (?, ?, ?, NULL, ?, ?)`,
            [id("link-token-b"), id("prog-raw"), "dup-token", TS, TS],
          ),
        /idx_share_links_token|UNIQUE constraint failed/i,
      );
    } finally {
      storage.close();
    }
  });
});
