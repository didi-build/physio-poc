import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const NODE_ADAPTER_PATH = "src/adapters/node/create-node-app-dependencies.ts";

function scanProcessEnvAccessInSource(
  source: string,
  repoRelativePath: string,
): string[] {
  const hits: string[] = [];
  const sourceFile = ts.createSourceFile(
    repoRelativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.name.text === "env"
    ) {
      hits.push(repoRelativePath);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return hits;
}

function readNodeAdapterSource(): string {
  return readFileSync(join(REPO_ROOT, NODE_ADAPTER_PATH), "utf8");
}

describe("wrapSqlPort DI (DIDI-1150)", () => {
  it("defaults wrapSqlPort to the identity function when omitted", async () => {
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: "https://auth.example",
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "dev@example.com",
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    });
    await expect(deps.sql.run("SELECT 1")).resolves.toBeDefined();
  });

  it("applies a custom wrapSqlPort when provided", async () => {
    let wrapInvoked = false;
    await createNodeAppDependencies(
      {
        AUTH_BASE_URL: "https://auth.example",
        PHYSIO_ALLOWED_GOOGLE_EMAILS: "dev@example.com",
        PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
        BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
      },
      {
        wrapSqlPort: (sql) => {
          wrapInvoked = true;
          return sql;
        },
      },
    );
    expect(wrapInvoked).toBe(true);
  });

  it("is not referenced from production entrypoints", () => {
    const workerEntry = readFileSync(
      join(REPO_ROOT, "src/adapters/workers/create-app-dependencies.ts"),
      "utf8",
    );
    const nodeEntry = readFileSync(join(REPO_ROOT, "src/entry/node.ts"), "utf8");
    expect(workerEntry).not.toContain("wrapSqlPort");
    expect(nodeEntry).not.toContain("wrapSqlPort");
  });

  it("does not read process.env anywhere in create-node-app-dependencies (Q10)", () => {
    const adapterSource = readNodeAdapterSource();
    expect(scanProcessEnvAccessInSource(adapterSource, NODE_ADAPTER_PATH)).toEqual([]);
    expect(adapterSource).not.toMatch(/PHYSIO_WRAP_SQL_PORT/);
    expect(adapterSource).not.toMatch(/PHYSIO_TRACE_SQL/);
  });

  it("flags process.env reads on their own line in a mutation fixture (Q10)", () => {
    const fixturePath =
      "test/fixtures/node-wrap-sql-port/mutations/process-env-read.ts";
    const fixtureSource = readFileSync(join(REPO_ROOT, fixturePath), "utf8");
    expect(
      scanProcessEnvAccessInSource(fixtureSource, fixturePath).length,
    ).toBeGreaterThan(0);
  });

  it("wires wrapSqlPort only through the DI default and sqlPort assignment", () => {
    const adapterSource = readNodeAdapterSource();
    const wrapSqlPortMatches = [...adapterSource.matchAll(/\bwrapSqlPort\b/g)];
    expect(wrapSqlPortMatches).toHaveLength(3);
    expect(adapterSource).toContain(
      "wrapSqlPort?: (sql: SqlStoragePort) => SqlStoragePort;",
    );
    expect(adapterSource).toContain("wrapSqlPort = (sql) => sql,");
    expect(adapterSource).toContain("const sqlPort = wrapSqlPort(storage);");
    expect(adapterSource).toContain(
      "createNodeAuthPort(storage.nativeDatabase(), sqlPort, config,",
    );
    expect(adapterSource).toContain("sql: sqlPort,");
  });

  it("always applies wrapSqlPort to deps.sql even when env would skip wrapping (Q11)", async () => {
    let wrapInvoked = false;
    const wrappedSql: SqlStoragePort = {
      run: async () => ({ rowsAffected: 0 }),
      all: async () => [],
      first: async () => null,
      batch: async () => {},
    };
    const deps = await createNodeAppDependencies(
      {
        AUTH_BASE_URL: "https://auth.example",
        PHYSIO_ALLOWED_GOOGLE_EMAILS: "dev@example.com",
        PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
        BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
        PHYSIO_SQL_WRAP: "passthrough",
      } as Parameters<typeof createNodeAppDependencies>[0] & {
        PHYSIO_SQL_WRAP?: string;
      },
      {
        wrapSqlPort: (sql) => {
          wrapInvoked = true;
          expect(sql.run).toBeTypeOf("function");
          return wrappedSql;
        },
      },
    );
    expect(wrapInvoked).toBe(true);
    expect(deps.sql).toBe(wrappedSql);
  });

  it("is only passed from test helpers besides the node adapter definition", () => {
    const out = execFileSync("git", ["grep", "-l", "wrapSqlPort", "--", "."], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    });
    const files = out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((file) => file.replace(/^\.\//, ""))
      .sort();
    expect(files).toContain("src/adapters/node/create-node-app-dependencies.ts");
    const passSites = files.filter(
      (file) => file !== "src/adapters/node/create-node-app-dependencies.ts",
    );
    expect(passSites.length).toBeGreaterThan(0);
    expect(passSites.every((file) => file.startsWith("test/"))).toBe(true);
  });
});
