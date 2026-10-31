import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

const REPO_ROOT = join(import.meta.dirname, "..");

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

  it("does not read wrapSqlPort from process.env in the node adapter", () => {
    const adapterSource = readFileSync(
      join(REPO_ROOT, "src/adapters/node/create-node-app-dependencies.ts"),
      "utf8",
    );
    expect(adapterSource).not.toMatch(/PHYSIO_WRAP_SQL_PORT/);
    expect(adapterSource).not.toMatch(/process\.env[^\n]*wrapSqlPort/);
    expect(adapterSource).not.toMatch(/wrapSqlPort[^\n]*process\.env/);
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
