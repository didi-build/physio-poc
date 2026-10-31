import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";
import {
  isSqlDuplicateIdError,
  SqlDuplicateIdError,
} from "../src/storage/errors/sql-duplicate-id-error.js";
import {
  PROGRAM_ID_ALREADY_IN_USE,
  ProgramRepositoryError,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { TS, seedPractitioner } from "./helpers/exercise-sqlite-fixture.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

describe("SqlDuplicateIdError adapters", () => {
  it("InMemorySqlStorage throws SqlDuplicateIdError on duplicate programs.id", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO programs (id, label) VALUES (?, ?)", ["dup-a", "one"]);
    await expect(
      sql.run("INSERT INTO programs (id, label) VALUES (?, ?)", ["dup-a", "two"]),
    ).rejects.toSatisfy((error: unknown) => isSqlDuplicateIdError(error));
  });

  it("InMemorySqlStorage keeps generic duplicate errors for other tables", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["dup", "one"]);
    await expect(
      sql.run("INSERT INTO items (id, label) VALUES (?, ?)", ["dup", "two"]),
    ).rejects.toThrow(/Duplicate id in items/);
  });

  it("BetterSqliteStorage throws SqlDuplicateIdError on duplicate programs.id", async () => {
    const sql = BetterSqliteStorage.openInMemory();
    try {
      sql.execScript(
        "CREATE TABLE programs (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE);",
      );
      await sql.run("INSERT INTO programs (id, code) VALUES (?, ?)", ["p-1", "AAA111"]);
      await expect(
        sql.run("INSERT INTO programs (id, code) VALUES (?, ?)", ["p-1", "BBB222"]),
      ).rejects.toSatisfy((error: unknown) => isSqlDuplicateIdError(error));
    } finally {
      sql.close();
    }
  });

  it("ProgramsRepository maps duplicate program id to PROGRAM_ID_ALREADY_IN_USE on InMemorySqlStorage", async () => {
    const sql = new InMemorySqlStorage();
    const practitionerId = await seedPractitioner(sql);
    const sharedProgramId = testOpaqueEntityId("repo-dup-id-memory");
    const programs = new ProgramsRepository(sql);
    await programs.create({
      id: sharedProgramId,
      createdBy: practitionerId,
      createdAt: TS,
    });
    await expect(
      programs.create({
        id: sharedProgramId,
        createdBy: practitionerId,
        createdAt: TS,
      }),
    ).rejects.toEqual(new ProgramRepositoryError(PROGRAM_ID_ALREADY_IN_USE));
  });

  it("ProgramsRepository maps duplicate program id to PROGRAM_ID_ALREADY_IN_USE on BetterSqliteStorage", async () => {
    const sql = BetterSqliteStorage.openInMemory();
    try {
      sql.execScript(`
        CREATE TABLE practitioners (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE programs (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          draft_version INTEGER NOT NULL,
          draft_updated_at TEXT NOT NULL,
          published_version INTEGER,
          published_name TEXT,
          published_at TEXT,
          published_snapshot_json TEXT,
          deleted_at TEXT,
          link_expires_in TEXT,
          link_expires_on TEXT,
          source_routine_id TEXT,
          source_routine_version_id TEXT,
          source_routine_origin TEXT
        );
      `);
      const practitionerId = await seedPractitioner(sql);
      const sharedProgramId = testOpaqueEntityId("repo-dup-id-sqlite");
      const programs = new ProgramsRepository(sql);
      await programs.create({
        id: sharedProgramId,
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        programs.create({
          id: sharedProgramId,
          createdBy: practitionerId,
          createdAt: TS,
        }),
      ).rejects.toEqual(new ProgramRepositoryError(PROGRAM_ID_ALREADY_IN_USE));
    } finally {
      sql.close();
    }
  });

  it("does not retry client-supplied program id collisions as generated code collisions", async () => {
    const sql = new InMemorySqlStorage();
    const practitionerId = await seedPractitioner(sql);
    const sharedProgramId = testOpaqueEntityId("repo-dup-no-retry");
    const programs = new ProgramsRepository(sql);
    await programs.create({
      id: sharedProgramId,
      createdBy: practitionerId,
      createdAt: TS,
      code: "PRG-AAAA",
    });
    await expect(
      programs.create({
        id: sharedProgramId,
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-BBBB",
      }),
    ).rejects.toEqual(new ProgramRepositoryError(PROGRAM_ID_ALREADY_IN_USE));
    const row = await sql.first<{ code: string }>(
      "SELECT code FROM programs WHERE id = ? LIMIT 1",
      [sharedProgramId],
    );
    expect(row?.code).toBe("PRG-AAAA");
  });
});

describe("SqlDuplicateIdError identity", () => {
  it("uses a stable name for instanceof checks", () => {
    const error = new SqlDuplicateIdError("programs", "abc");
    expect(error.name).toBe("SqlDuplicateIdError");
    expect(error.tableName).toBe("programs");
    expect(error.duplicateId).toBe("abc");
  });
});
