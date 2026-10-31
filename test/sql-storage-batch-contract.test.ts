import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

const SERVICE_REPO_ROOTS = [
  join(import.meta.dirname, "..", "src", "services"),
  join(import.meta.dirname, "..", "src", "storage", "repositories"),
] as const;

const SERVICE_REPO_FILES = [
  join(
    import.meta.dirname,
    "..",
    "src",
    "services",
    "exercise-library",
    "exercise-library-service.ts",
  ),
  join(import.meta.dirname, "..", "src", "services", "exercise-library", "index.ts"),
  join(import.meta.dirname, "..", "src", "services", "exercise-library", "types.ts"),
  join(
    import.meta.dirname,
    "..",
    "src",
    "services",
    "exercise-media",
    "exercise-media-service.ts",
  ),
  join(import.meta.dirname, "..", "src", "services", "exercise-media", "index.ts"),
  join(import.meta.dirname, "..", "src", "services", "health.ts"),
  join(import.meta.dirname, "..", "src", "services", "index.ts"),
  join(import.meta.dirname, "..", "src", "services", "mcp", "stub-tool-handler.ts"),
  join(import.meta.dirname, "..", "src", "services", "mcp", "validate-tool-input.ts"),
  join(import.meta.dirname, "..", "src", "services", "my-defaults", "index.ts"),
  join(
    import.meta.dirname,
    "..",
    "src",
    "services",
    "my-defaults",
    "my-defaults-service.ts",
  ),
  join(import.meta.dirname, "..", "src", "services", "my-defaults", "types.ts"),
  join(import.meta.dirname, "..", "src", "services", "programs", "index.ts"),
  join(
    import.meta.dirname,
    "..",
    "src",
    "services",
    "programs",
    "program-builder-service.ts",
  ),
  join(import.meta.dirname, "..", "src", "services", "programs", "row-resolution.ts"),
  join(import.meta.dirname, "..", "src", "services", "programs", "types.ts"),
  join(import.meta.dirname, "..", "src", "storage", "repositories", "exercise-data.ts"),
  join(
    import.meta.dirname,
    "..",
    "src",
    "storage",
    "repositories",
    "exercise-library-read.ts",
  ),
  join(
    import.meta.dirname,
    "..",
    "src",
    "storage",
    "repositories",
    "exercise-media.ts",
  ),
  join(
    import.meta.dirname,
    "..",
    "src",
    "storage",
    "repositories",
    "practitioner-auth.ts",
  ),
  join(import.meta.dirname, "..", "src", "storage", "repositories", "programs.ts"),
  join(import.meta.dirname, "..", "src", "storage", "repositories", "routines.ts"),
  join(import.meta.dirname, "..", "src", "storage", "repositories", "type-defaults.ts"),
] as const;

function readServiceRepoSources(): string[] {
  return SERVICE_REPO_FILES.map((file) => readFileSync(file, "utf8"));
}

describe("service and repository SQL transaction guard", () => {
  it("does not use raw BEGIN, COMMIT, or ROLLBACK in pinned service and repository files", () => {
    const forbidden =
      /\b(await\s+)?(this\.)?(sql\.)?run\(\s*["'](BEGIN|COMMIT|ROLLBACK)["']/i;
    for (const source of readServiceRepoSources()) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it("pins the scanned service and repository file list", () => {
    expect(SERVICE_REPO_ROOTS.length).toBe(2);
    expect(SERVICE_REPO_FILES.length).toBe(23);
  });

  it("guard scan reads every pinned nested service path, not a shallow directory listing", () => {
    const shallow: string[] = [];
    for (const root of SERVICE_REPO_ROOTS) {
      for (const name of readdirSync(root)) {
        if (name.endsWith(".ts")) {
          shallow.push(join(root, name));
        }
      }
    }
    expect(shallow.length).toBeLessThan(SERVICE_REPO_FILES.length);
    expect(readServiceRepoSources().length).toBe(SERVICE_REPO_FILES.length);
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
