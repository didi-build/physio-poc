import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import type { PhysioD1PreparedStatement } from "../src/adapters/workers/d1-sql-storage.js";
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
    expect(
      relativePaths.some((path) => path.startsWith("src/storage/migrations/")),
    ).toBe(false);
  });

  it("positive control: matcher detects transaction keywords case-insensitively in run strings", () => {
    const pattern = rawSqlTransactionControlPattern();
    expect(pattern.test('await sql.run("BEGIN");')).toBe(true);
    expect(pattern.test("await sql.run(`BEGIN`);")).toBe(true);
    expect(pattern.test('await sql.run("begin");')).toBe(true);
    expect(pattern.test('await sql.run("BEGIN IMMEDIATE");')).toBe(true);
    expect(pattern.test('await sql.run("SAVEPOINT link_tx");')).toBe(true);
    expect(pattern.test('await this.sql.run("rollback");')).toBe(true);
    expect(pattern.test('await sql.run("SELECT 1");')).toBe(false);
  });

  it("pins the scanned root directories", () => {
    expect(TRANSACTION_GUARD_SCAN_ROOTS.length).toBe(2);
  });

  it("end-to-end scan reports planted fixture violations outside the repo", () => {
    const root = mkdtempSync(join(tmpdir(), "physio-tx-guard-"));
    const services = join(root, "services", "nested");
    mkdirSync(services, { recursive: true });
    const cases: { file: string; body: string }[] = [
      {
        file: "backtick-begin.ts",
        body: "export async function f(sql: { run(s: string): Promise<void> }) {\n  await sql.run(`BEGIN`);\n}\n",
      },
      {
        file: "begin-immediate.ts",
        body: 'export async function f(sql: { run(s: string): Promise<void> }) {\n  await sql.run("BEGIN IMMEDIATE");\n}\n',
      },
      {
        file: "savepoint.ts",
        body: 'export async function f(sql: { run(s: string): Promise<void> }) {\n  await sql.run("SAVEPOINT s1");\n}\n',
      },
      {
        file: "batch-begin.ts",
        body: 'export async function f(sql: { batch(st: { sql: string }[]): Promise<void> }) {\n  await sql.batch([{ sql: "BEGIN" }]);\n}\n',
      },
      {
        file: "variable-begin.ts",
        body: 'const beginSql = "BEGIN";\nexport async function f(sql: { run(s: string): Promise<void> }) {\n  await sql.run(beginSql);\n}\n',
      },
    ];
    try {
      for (const testCase of cases) {
        writeFileSync(join(services, testCase.file), testCase.body, "utf8");
      }
      const violations = findRawSqlTransactionControlViolations({
        roots: [join(root, "services")],
      });
      expect(violations.length).toBe(cases.length);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
      await sql.run(
        "CREATE TABLE link_rows (id TEXT PRIMARY KEY, program_id TEXT, linked INTEGER DEFAULT 0)",
      );
      await sql.run(
        "CREATE TABLE approvals (id TEXT PRIMARY KEY, status TEXT, exercise_id TEXT)",
      );
      return;
    }
    if (sql instanceof InMemorySqlStorage) {
      await sql.run("CREATE TABLE widgets (id TEXT PRIMARY KEY, label TEXT)");
      await sql.run("CREATE TABLE guarded (id TEXT PRIMARY KEY, status TEXT)");
      await sql.run(
        "CREATE TABLE link_rows (id TEXT PRIMARY KEY, program_id TEXT, linked INTEGER DEFAULT 0)",
      );
      await sql.run(
        "CREATE TABLE approvals (id TEXT PRIMARY KEY, status TEXT, exercise_id TEXT)",
      );
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

  it("rolls back an earlier write when a later guarded statement matches zero rows", async () => {
    const sql = await create();
    await seedContractTables(sql);
    await sql.run("INSERT INTO guarded (id, status) VALUES (?, ?)", ["g-1", "open"]);
    await expect(
      sql.batch([
        {
          sql: "INSERT INTO widgets (id, label) VALUES (?, ?)",
          bindings: ["w-mid", "should-not-stick"],
        },
        {
          sql: "UPDATE guarded SET status = ? WHERE id = ? AND status = ?",
          bindings: ["closed", "g-1", "drafting"],
          minRowsAffected: 1,
        },
      ]),
    ).rejects.toBeInstanceOf(SqlBatchGuardError);
    const widget = await sql.first<{ id: string }>(
      "SELECT * FROM widgets WHERE id = ? LIMIT 1",
      ["w-mid"],
    );
    expect(widget).toBeNull();
  });

  it("rolls back link writes when a later approval guard matches zero rows (#20 shape)", async () => {
    const sql = await create();
    await seedContractTables(sql);
    await sql.run("INSERT INTO link_rows (id, program_id, linked) VALUES (?, ?, ?)", [
      "row-1",
      "prog-1",
      0,
    ]);
    await sql.run("INSERT INTO approvals (id, status, exercise_id) VALUES (?, ?, ?)", [
      "req-1",
      "pending",
      null,
    ]);
    await expect(
      sql.batch([
        {
          sql: "UPDATE link_rows SET linked = ? WHERE id = ? AND linked = ?",
          bindings: [1, "row-1", 0],
          minRowsAffected: 1,
        },
        {
          sql: "UPDATE approvals SET status = ?, exercise_id = ? WHERE id = ? AND status = ?",
          bindings: ["approved", "ex-1", "req-1", "drafting"],
          minRowsAffected: 1,
        },
      ]),
    ).rejects.toBeInstanceOf(SqlBatchGuardError);
    const linked = await sql.first<{ linked: number }>(
      "SELECT * FROM link_rows WHERE id = ? LIMIT 1",
      ["row-1"],
    );
    expect(linked?.linked ?? 0).toBe(0);
  });
});

describe("InMemorySqlStorage batch concurrency", () => {
  it("serializes concurrent run with batch via the storage lock", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("CREATE TABLE widgets (id TEXT PRIMARY KEY, label TEXT)");
    const batchPromise = sql.batch([
      {
        sql: "INSERT INTO widgets (id, label) VALUES (?, ?)",
        bindings: ["w-a", "first"],
      },
      {
        sql: "INSERT INTO widgets (id, label) VALUES (?, ?)",
        bindings: ["w-b", "second"],
      },
    ]);
    const runPromise = sql.run("INSERT INTO widgets (id, label) VALUES (?, ?)", [
      "side",
      "ok",
    ]);
    await Promise.all([batchPromise, runPromise]);
    const side = await sql.first<{ id: string }>(
      "SELECT * FROM widgets WHERE id = ? LIMIT 1",
      ["side"],
    );
    expect(side?.id).toBe("side");
    const second = await sql.first<{ id: string }>(
      "SELECT * FROM widgets WHERE id = ? LIMIT 1",
      ["w-b"],
    );
    expect(second?.id).toBe("w-b");
  });

  it("does not erase concurrent writes when the batch fails", async () => {
    const sql = new InMemorySqlStorage();
    await sql.run("CREATE TABLE widgets (id TEXT PRIMARY KEY, label TEXT)");
    await sql.run("INSERT INTO widgets (id, label) VALUES (?, ?)", ["keep", "stay"]);
    const batchPromise = sql
      .batch([
        {
          sql: "INSERT INTO widgets (id, label) VALUES (?, ?)",
          bindings: ["gone", "x"],
        },
        {
          sql: "INSERT INTO widgets (id, label) VALUES (?, ?)",
          bindings: ["keep", "duplicate"],
        },
      ])
      .catch(() => undefined);
    await sql.run("INSERT INTO widgets (id, label) VALUES (?, ?)", ["side", "ok"]);
    await batchPromise;
    const side = await sql.first<{ id: string }>(
      "SELECT * FROM widgets WHERE id = ? LIMIT 1",
      ["side"],
    );
    expect(side?.id).toBe("side");
    const gone = await sql.first<{ id: string }>(
      "SELECT * FROM widgets WHERE id = ? LIMIT 1",
      ["gone"],
    );
    expect(gone).toBeNull();
  });

  it("rejects BEGIN inside batch", async () => {
    const sql = new InMemorySqlStorage();
    await expect(sql.batch([{ sql: "BEGIN", bindings: [] }])).rejects.toThrow(
      /not allowed inside batch/i,
    );
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

  it("rejects plain { sql, args } objects in db.batch", async () => {
    const d1 = createFakePhysioD1Database();
    await expect(
      d1.batch([{ sql: "SELECT 1", args: [] } as unknown as PhysioD1PreparedStatement]),
    ).rejects.toThrow(/prepared statements/i);
  });
});
