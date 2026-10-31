import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestHarness } from "wrangler";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  D1_PLACEHOLDER_PRODUCTION,
  looksLikeCommittedProductionD1Id,
  PHYSIO_D1_BINDING,
  PHYSIO_D1_DATABASE_NAME,
} from "../scripts/lib/wrangler-d1-placeholders.mjs";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { isSqlDuplicateIdError } from "../src/storage/errors/sql-duplicate-id-error.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github/workflows");
const DEPLOY_WORKFLOW_FILENAME = "deploy-physio-mcp-worker.yml";
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");
const DEPLOY_WORKFLOW_PATH = join(WORKFLOWS_DIR, DEPLOY_WORKFLOW_FILENAME);
const CI_WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/ci.yml");
const CREATE_DEPS_PATH = join(
  REPO_ROOT,
  "src/adapters/workers/create-app-dependencies.ts",
);

function parseWranglerJsonc(text: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => printParseErrorCode(entry.error)).join(", "));
  }
  if (
    parsed === undefined ||
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Expected wrangler.jsonc root object");
  }
  return parsed as Record<string, unknown>;
}

function nonDeployWorkflowFilenames(workflowsDir: string): string[] {
  return readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".yml") && name !== DEPLOY_WORKFLOW_FILENAME)
    .sort();
}

function workflowFilesReferencingProductionD1(
  workflowsDir: string,
  readText: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string[] {
  return nonDeployWorkflowFilenames(workflowsDir).filter((file) => {
    const text = readText(join(workflowsDir, file));
    return (
      text.includes("PHYSIO_D1_DATABASE_ID") ||
      text.includes("d1 migrations apply") ||
      text.includes("--remote")
    );
  });
}

function violationsInPrepareWranglerStepRunBody(body: string): string[] {
  const violations: string[] = [];
  if (/\bcat\b[^\n]*wrangler\.ci\.jsonc/.test(body)) {
    violations.push("cat-wrangler-config");
  }
  if (/\bset\s+-x\b/.test(body) || /\bset\s+-o\s+xtrace\b/.test(body)) {
    violations.push("set-x");
  }
  for (const line of body.split("\n")) {
    if (
      /\becho\b/.test(line) &&
      /\$\{?PHYSIO_D1_DATABASE_ID\}?/.test(line) &&
      !/::add-mask::/.test(line)
    ) {
      violations.push("echo-secret");
      break;
    }
    if (
      /\bprintf\b/.test(line) &&
      /\$\{?PHYSIO_D1_DATABASE_ID\}?/.test(line) &&
      !/::add-mask::/.test(line)
    ) {
      violations.push("printf-secret");
      break;
    }
  }
  if (/\bupload-artifact\b/.test(body)) {
    violations.push("upload-artifact");
  }
  if (/ACTIONS_STEP_DEBUG/.test(body)) {
    violations.push("actions-step-debug");
  }
  return violations;
}

function assertPrepareWranglerStepDoesNotLeak(body: string): void {
  expect(violationsInPrepareWranglerStepRunBody(body)).toEqual([]);
}

function readDeployWorkflowText(): string {
  return readFileSync(DEPLOY_WORKFLOW_PATH, "utf8");
}

function readCiWorkflowText(): string {
  return readFileSync(CI_WORKFLOW_PATH, "utf8");
}

function deployJobBlock(workflowText: string): string {
  const jobsIndex = workflowText.indexOf("jobs:");
  if (jobsIndex === -1) {
    throw new Error("deploy workflow missing jobs:");
  }
  return workflowText.slice(jobsIndex);
}

function stepBodiesAfterName(workflowText: string, stepName: string): string[] {
  const needle = `- name: ${stepName}`;
  const bodies: string[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = workflowText.indexOf(needle, searchFrom);
    if (idx === -1) break;
    const runIdx = workflowText.indexOf("\n        run:", idx);
    if (runIdx === -1) {
      throw new Error(`step ${stepName} missing run block`);
    }
    const pipe = workflowText.indexOf("|", runIdx);
    const nextStep = workflowText.indexOf("\n      - ", pipe + 1);
    const end = nextStep === -1 ? workflowText.length : nextStep;
    bodies.push(workflowText.slice(pipe + 1, end));
    searchFrom = end;
  }
  return bodies;
}

function stepIndexByName(jobBlock: string, stepName: string): number {
  const lines = jobBlock.split("\n");
  let stepCount = 0;
  for (const line of lines) {
    if (/^\s+- uses:/.test(line) || /^\s+- name:/.test(line)) {
      stepCount += 1;
    }
    if (line.trim() === `- name: ${stepName}`) {
      return stepCount;
    }
  }
  return -1;
}

describe("D1 binding in wrangler.jsonc (DIDI-1031)", () => {
  it("declares PHYSIO_DB with the production placeholder database_id", () => {
    const parsed = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    const d1 = parsed.d1_databases as Record<string, unknown>[] | undefined;
    expect(Array.isArray(d1)).toBe(true);
    expect(d1).toHaveLength(1);
    const entry = d1![0]!;
    expect(entry.binding).toBe(PHYSIO_D1_BINDING);
    expect(entry.database_name).toBe(PHYSIO_D1_DATABASE_NAME);
    expect(entry.database_id).toBe(D1_PLACEHOLDER_PRODUCTION);
    expect(looksLikeCommittedProductionD1Id(entry.database_id as string)).toBe(false);
    expect(entry.migrations_dir).toBe("migrations");
  });
});

describe("production deploy workflow (DIDI-1031)", () => {
  const workflowText = readDeployWorkflowText();
  const jobBlock = deployJobBlock(workflowText);

  it("keeps contents read permissions and checkout persist-credentials false", () => {
    expect(workflowText).toMatch(/^permissions:\s*\n\s*contents: read\s*$/m);
    expect(workflowText).toContain("persist-credentials: false");
  });

  it("runs only on main with environment production on the deploy job", () => {
    expect(jobBlock).toContain("if: github.ref == 'refs/heads/main'");
    expect(jobBlock).toContain("environment: production");
  });

  it("substitutes the D1 placeholder from PHYSIO_D1_DATABASE_ID without printing the config", () => {
    const bodies = stepBodiesAfterName(
      workflowText,
      "Prepare Wrangler config (production D1 ID)",
    );
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    expect(body).toContain("PHYSIO_D1_DATABASE_ID");
    expect(body).toContain("::add-mask::");
    expect(body).toContain("prepare-wrangler-config.mjs");
    expect(body).toContain("wrangler.ci.jsonc");
    expect(body).toContain("TRIMMED");
    expect(body).toContain("leading or trailing whitespace");
    assertPrepareWranglerStepDoesNotLeak(body);
  });

  it("applies remote D1 migrations before deploy using the prepared config", () => {
    const migrateBodies = stepBodiesAfterName(
      workflowText,
      "Apply production D1 migrations",
    );
    expect(migrateBodies).toHaveLength(1);
    const migrateBody = migrateBodies[0]!;
    expect(migrateBody).toContain("d1 migrations apply PHYSIO_DB --remote");
    expect(migrateBody).toContain("--config wrangler.ci.jsonc");

    const deployStep = workflowText.match(
      /- name: Deploy to Cloudflare Workers[\s\S]*?command: ([^\n]+)/,
    );
    expect(deployStep?.[1]).toBe("deploy --config wrangler.ci.jsonc");

    const migrateIdx = stepIndexByName(jobBlock, "Apply production D1 migrations");
    const deployIdx = stepIndexByName(jobBlock, "Deploy to Cloudflare Workers");
    expect(migrateIdx).toBeGreaterThan(0);
    expect(deployIdx).toBeGreaterThan(migrateIdx);
  });

  it("uses --remote only in the production deploy workflow job", () => {
    expect(workflowText.match(/--remote/g)?.length ?? 0).toBe(1);
    expect(readCiWorkflowText()).not.toContain("--remote");
    expect(readCiWorkflowText()).not.toContain("PHYSIO_D1_DATABASE_ID");
    expect(readCiWorkflowText()).not.toContain("d1 migrations apply");
  });

  it("does not run on pull_request", () => {
    expect(workflowText).not.toMatch(/^\s*pull_request:/m);
  });

  it("does not reference production D1 secrets outside the production deploy job file", () => {
    expect(workflowFilesReferencingProductionD1(WORKFLOWS_DIR)).toEqual([]);
  });
});

describe("Prepare Wrangler config step leak guards (DIDI-1146)", () => {
  it("passes on the production deploy workflow prepare step", () => {
    const bodies = stepBodiesAfterName(
      readDeployWorkflowText(),
      "Prepare Wrangler config (production D1 ID)",
    );
    assertPrepareWranglerStepDoesNotLeak(bodies[0]!);
  });

  it("rejects cat of wrangler.ci.jsonc", () => {
    expect(violationsInPrepareWranglerStepRunBody("cat wrangler.ci.jsonc")).toContain(
      "cat-wrangler-config",
    );
  });

  it("rejects set -x", () => {
    expect(
      violationsInPrepareWranglerStepRunBody("set -x\nnode scripts/run.mjs"),
    ).toContain("set-x");
  });

  it("rejects echo of PHYSIO_D1_DATABASE_ID outside add-mask", () => {
    expect(
      violationsInPrepareWranglerStepRunBody('echo "secret=${PHYSIO_D1_DATABASE_ID}"'),
    ).toContain("echo-secret");
  });

  it("rejects printf of PHYSIO_D1_DATABASE_ID outside add-mask", () => {
    expect(
      violationsInPrepareWranglerStepRunBody('printf "%s" "${PHYSIO_D1_DATABASE_ID}"'),
    ).toContain("printf-secret");
  });

  it("rejects upload-artifact", () => {
    expect(
      violationsInPrepareWranglerStepRunBody("uses: actions/upload-artifact@v4"),
    ).toContain("upload-artifact");
  });

  it("rejects ACTIONS_STEP_DEBUG", () => {
    expect(
      violationsInPrepareWranglerStepRunBody("env:\n  ACTIONS_STEP_DEBUG: true"),
    ).toContain("actions-step-debug");
  });
});

describe("workflow glob for production D1 secret scan (DIDI-1146)", () => {
  it("includes every non-deploy workflow file under .github/workflows", () => {
    const names = nonDeployWorkflowFilenames(WORKFLOWS_DIR);
    expect(names).toContain("ci.yml");
    expect(names).toContain("bootstrap.yml");
    expect(names).not.toContain(DEPLOY_WORKFLOW_FILENAME);
  });

  it("picks up a newly added workflow file in the scan set", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-workflow-glob-"));
    try {
      writeFileSync(join(tempDir, "ci.yml"), "name: ci\n");
      writeFileSync(join(tempDir, "extra-leak.yml"), "PHYSIO_D1_DATABASE_ID\n");
      const flagged = workflowFilesReferencingProductionD1(tempDir);
      expect(flagged).toEqual(["extra-leak.yml"]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Worker entry SQL adapter wiring (DIDI-1031)", () => {
  it("passes env.PHYSIO_DB into D1SqlStorage from createWorkerAppDependencies", () => {
    const source = readFileSync(CREATE_DEPS_PATH, "utf8");
    expect(source).toContain("PHYSIO_DB?: PhysioD1Database");
    expect(source).toMatch(/new D1SqlStorage\(env\.PHYSIO_DB\)/);
    expect(source).not.toContain("InMemorySqlStorage");
  });

  it("constructs D1SqlStorage for Worker deps without requiring SQL on auth-only paths", () => {
    const deps = createWorkerAppDependencies({});
    expect(deps.sql).toBeInstanceOf(D1SqlStorage);
  });

  it("reads, writes, booleans, empty results and duplicate ids through local D1", async () => {
    const persist = mkdtempSync(join(tmpdir(), "physio-d1-adapter-"));
    const configPath = join(persist, "wrangler.jsonc");
    writeFileSync(
      configPath,
      `${JSON.stringify(
        {
          name: "physio-d1-adapter-test",
          main: join(REPO_ROOT, "src/entry/worker.ts"),
          compatibility_date: "2025-10-29",
          d1_databases: [
            {
              binding: "PHYSIO_DB",
              database_name: "physio-d1-adapter-test",
              database_id: "00000000-0000-0000-0000-000000000003",
              migrations_dir: join(REPO_ROOT, "migrations"),
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const server = createTestHarness({
      root: REPO_ROOT,
      workers: [
        {
          configPath,
          persist: { path: persist },
        } as { configPath: string },
      ],
    });
    await server.listen();
    const worker = server.getWorker<{ PHYSIO_DB: unknown }>();
    await worker.applyD1Migrations("PHYSIO_DB");
    const env = await worker.getEnv();
    const sql = new D1SqlStorage(env.PHYSIO_DB as never);

    const missing = await sql.all("SELECT id FROM programs WHERE id = ?", [
      "00000000-0000-0000-0000-000000000099",
    ]);
    expect(missing).toEqual([]);

    await sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      ["prac-d1-fixture", "prac-d1-fixture@example.com", "2026-01-01T00:00:00.000Z"],
    );
    await sql.run(
      `INSERT INTO programs (
        id, code, name, created_by, created_at, draft_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        "prog-d1-fixture",
        "AAA111",
        "Fixture plan",
        "prac-d1-fixture",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      ],
    );

    const row = await sql.first<{ name: string }>(
      "SELECT name FROM programs WHERE id = ?",
      ["prog-d1-fixture"],
    );
    expect(row?.name).toBe("Fixture plan");

    const boolRow = await sql.first<{ flag: number }>("SELECT ? as flag", [false]);
    expect(boolRow?.flag).toBe(0);

    await expect(
      sql.run(
        `INSERT INTO programs (
          id, code, name, created_by, created_at, draft_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          "prog-d1-fixture",
          "BBB222",
          "Duplicate",
          "prac-d1-fixture",
          "2026-01-01T00:00:00.000Z",
          "2026-01-01T00:00:00.000Z",
        ],
      ),
    ).rejects.toSatisfy((error: unknown) => isSqlDuplicateIdError(error));

    await server.close();
    rmSync(persist, { recursive: true, force: true });
  }, 120_000);
});
