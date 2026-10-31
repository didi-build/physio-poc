import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { SqlBatchGuardError } from "../src/storage/errors/sql-batch-error.js";
import { SqlDuplicateIdError } from "../src/storage/errors/sql-duplicate-id-error.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";
import {
  createFakePhysioD1Database,
  runFakeD1Statements,
} from "./helpers/fake-physio-d1-database.js";
import {
  TRANSACTION_GUARD_SCAN_ROOTS,
  findRawSqlTransactionControlViolations,
  listTransactionGuardScanFiles,
  rawSqlTransactionControlPattern,
  relativeFromRepoRoot,
} from "./sql-storage-transaction-guard.js";

describe("service and repository SQL transaction guard", () => {
  it("does not use raw BEGIN, COMMIT, or ROLLBACK under scanned service and repository trees", () => {
    const violations = findRawSqlTransactionControlViolations();
    expect(violations).toEqual([]);
  });

  it("recursively scans nested TypeScript under services and repositories", () => {
    const files = listTransactionGuardScanFiles();
    const relativePaths = files.map((file) => relativeFromRepoRoot(file));
    expect(relativePaths).toContain("src/services/programs/program-builder-service.ts");
    expect(relativePaths).toContain("src/storage/repositories/programs.ts");
    expect(relativePaths.some((path) => path.includes("/migrations/"))).toBe(false);
  });

  it("positive control: matcher detects transaction keywords case-insensitively in run strings", () => {
    const pattern = rawSqlTransactionControlPattern();
    expect(pattern.test('await sql.run("BEGIN");')).toBe(true);
    expect(pattern.test('await sql.run("begin");')).toBe(true);
    expect(pattern.test('await this.sql.run("rollback");')).toBe(true);
    expect(pattern.test('await sql.run("SELECT 1");')).toBe(false);
  });

  it("pins the scanned root directories", () => {
    expect(TRANSACTION_GUARD_SCAN_ROOTS.length).toBe(2);
  });
});

type AdapterCase = {
  label: string;
  create: () => SqlStoragePort | Promise<SqlStoragePort>;
};

const ADAPTERS: AdapterCase[] = [
  {
    label: "InMemorySqlStorage",
    create: () => new InMemorySqlStorage(),
  },
  {
    label: "BetterSqliteStorage",
    create: () => BetterSqliteStorage.openInMemory(),
  },
  {
    label: "D1SqlStorage fake",
    create: () => new D1SqlStorage(createFakePhysioD1Database()),
  },
];

describe.each(ADAPTERS)("SqlStoragePort.batch contract ($label)", ({ create }) => {
  async function seedContractTables(sql: SqlStoragePort): Promise<void> {
    if (sql instanceof BetterSqliteStorage || sql instanceof D1SqlStorage) {
      await sql.run("CREATE TABLE widgets (id TEXT PRIMARY KEY, label TEXT)");
      await sql.run("CREATE TABLE guarded (id TEXT PRIMARY KEY, status TEXT)");
      return;
    }
  }

  it("rolls back when a later statement throws", async () => {
    const sql = await create();
    await seedContractTables(sql);
    await sql.run("INSERT INTO widgets (id, label) VALUES (?, ?)", ["w-1", "keep"]);
    await expect(
      sql.batch([
        {
          sql: "INSERT INTO widgets (id, label) VALUES (?, ?)",
          bindings: ["w-2", "gone"],
        },
        {
          sql: "INSERT INTO widgets (id, label) VALUES (?, ?)",
          bindings: ["w-1", "duplicate"],
        },
      ]),
    ).rejects.toThrow();
    const rows = await sql.all<{ id: string }>("SELECT * FROM widgets WHERE id = ?", [
      "w-2",
    ]);
    expect(rows).toEqual([]);
    const kept = await sql.first<{ label: string }>(
      "SELECT * FROM widgets WHERE id = ? LIMIT 1",
      ["w-1"],
    );
    expect(kept?.label).toBe("keep");
  });

  it("fails the batch when minRowsAffected guard matches zero rows", async () => {
    const sql = await create();
    await seedContractTables(sql);
    await sql.run("INSERT INTO guarded (id, status) VALUES (?, ?)", ["g-1", "open"]);
    await expect(
      sql.batch([
        {
          sql: "UPDATE guarded SET status = ? WHERE id = ? AND status = ?",
          bindings: ["closed", "g-1", "drafting"],
          minRowsAffected: 1,
        },
      ]),
    ).rejects.toBeInstanceOf(SqlBatchGuardError);
    const row = await sql.first<{ status: string }>(
      "SELECT * FROM guarded WHERE id = ? LIMIT 1",
      ["g-1"],
    );
    expect(row?.status).toBe("open");
  });
});

describe("D1SqlStorage batch uses db.batch", () => {
  it("maps duplicate programs.id through batch", async () => {
    const d1 = createFakePhysioD1Database();
    await runFakeD1Statements(
      d1,
      "CREATE TABLE programs (id TEXT PRIMARY KEY, label TEXT)",
    );
    const sql = new D1SqlStorage(d1);
    await sql.run("INSERT INTO programs (id, label) VALUES (?, ?)", ["dup", "one"]);
    await expect(
      sql.batch([
        {
          sql: "INSERT INTO programs (id, label) VALUES (?, ?)",
          bindings: ["other", "two"],
        },
        {
          sql: "INSERT INTO programs (id, label) VALUES (?, ?)",
          bindings: ["dup", "three"],
        },
      ]),
    ).rejects.toBeInstanceOf(SqlDuplicateIdError);
    const row = await sql.first<{ label: string }>(
      "SELECT * FROM programs WHERE id = ? LIMIT 1",
      ["other"],
    );
    expect(row).toBeNull();
  });
});
