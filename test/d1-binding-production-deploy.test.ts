import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  COMMITTED_WEB_APP_BASE_URL,
} from "../scripts/lib/wrangler-d1-placeholders.mjs";
import {
  DEPLOY_WORKFLOW_FILENAME,
  deployJobBlock,
  deployJobSteps,
  EXPECTED_PREPARE_WRANGLER_STEP_RUN,
  fixtureDeployWorkflow,
  nonDeployWorkflowFilenames,
  normalizePrepareStepRunBody,
  prepareStepYamlBlock,
  stepBodiesAfterName,
  violationsInDeployJobStepText,
  violationsInDeployWorkflow,
  workflowFilesReferencingProductionD1,
  workflowReferencesProductionD1,
} from "./helpers/production-deploy-workflow-guards.js";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { isSqlDuplicateIdError } from "../src/storage/errors/sql-duplicate-id-error.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github/workflows");
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");
const DEPLOY_WORKFLOW_PATH = join(WORKFLOWS_DIR, DEPLOY_WORKFLOW_FILENAME);
const CI_WORKFLOW_PATH = join(WORKFLOWS_DIR, "ci.yml");
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

function readDeployWorkflowText(): string {
  return readFileSync(DEPLOY_WORKFLOW_PATH, "utf8");
}

function readCiWorkflowText(): string {
  return readFileSync(CI_WORKFLOW_PATH, "utf8");
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

  it("pins production WEB_APP_BASE_URL and keeps fake Google provider off in committed vars", () => {
    const parsed = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    const vars = parsed.vars as Record<string, string> | undefined;
    expect(vars?.WEB_APP_BASE_URL).toBe(COMMITTED_WEB_APP_BASE_URL);
    expect(vars?.PHYSIO_USE_FAKE_GOOGLE_PROVIDER).toBe("false");
  });
});

describe("production deploy workflow (DIDI-1031)", () => {
  const workflowText = readDeployWorkflowText();
  const jobBlock = deployJobBlock(workflowText);

  it("keeps contents read permissions and checkout persist-credentials false", () => {
    expect(workflowText).toMatch(/^permissions:\s*\n\s*contents: read\s*$/m);
    expect(workflowText).toContain("persist-credentials: false");
  });

  it("requires the exact main-branch guard on the deploy job", () => {
    expect(jobBlock).toMatch(/\n {4}if: github\.ref == 'refs\/heads\/main'\n/);
    expect(jobBlock).not.toMatch(/if: github\.ref == 'refs\/heads\/main' \|\| true/);
    expect(jobBlock).toContain("environment: production");
  });

  it("uses the exact Prepare Wrangler config run script for trim, newline checks and masking", () => {
    const bodies = stepBodiesAfterName(
      workflowText,
      "Prepare Wrangler config (production D1 ID)",
    );
    expect(bodies).toHaveLength(1);
    expect(normalizePrepareStepRunBody(bodies[0]!)).toBe(
      EXPECTED_PREPARE_WRANGLER_STEP_RUN,
    );
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
    expect(workflowText).not.toMatch(/vars\.PHYSIO_PRODUCTION_WEB_APP_BASE_URL/);
    expect(body).not.toMatch(/\bcat\b.*wrangler\.ci\.jsonc/);
  });

  it("requires set -o pipefail in the Prepare Wrangler config step", () => {
    expect(prepareStepYamlBlock(readDeployWorkflowText())).toContain(
      "set -euo pipefail",
    );
  });

  it("does not set continue-on-error on the Prepare Wrangler config step", () => {
    expect(prepareStepYamlBlock(workflowText)).not.toMatch(/continue-on-error:\s*true/);
  });

  it("does not leak derived D1 id material across any deploy job step", () => {
    expect(violationsInDeployWorkflow(workflowText)).toEqual([]);
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

  it("orders auth deploy steps validate < prepare < migrate < put < deploy (DIDI-1044)", () => {
    expect(workflowText).toContain("Validate production auth secrets");
    expect(workflowText).toContain("Prepare Wrangler config (production D1 ID)");
    expect(workflowText).toContain("Apply production D1 migrations");
    expect(workflowText).toContain("Put production Worker auth secrets");
    expect(workflowText).toContain("Deploy to Cloudflare Workers");
    const validateIdx = stepIndexByName(jobBlock, "Validate production auth secrets");
    const prepareIdx = stepIndexByName(
      jobBlock,
      "Prepare Wrangler config (production D1 ID)",
    );
    const migrateIdx = stepIndexByName(jobBlock, "Apply production D1 migrations");
    const putIdx = stepIndexByName(jobBlock, "Put production Worker auth secrets");
    const deployIdx = stepIndexByName(jobBlock, "Deploy to Cloudflare Workers");
    expect(validateIdx).toBeLessThan(prepareIdx);
    expect(prepareIdx).toBeLessThan(migrateIdx);
    expect(migrateIdx).toBeLessThan(putIdx);
    expect(putIdx).toBeLessThan(deployIdx);
  });

  it("does not reference production D1 secrets outside the production deploy job file", () => {
    expect(workflowFilesReferencingProductionD1(WORKFLOWS_DIR)).toEqual([]);
  });
});

describe("Deploy job static leak guards (DIDI-1146)", () => {
  it("rejects cat of wrangler.ci.jsonc in any step run body", () => {
    expect(violationsInDeployJobStepText("cat wrangler.ci.jsonc")).toContain(
      "cat-wrangler-config",
    );
  });

  it("rejects set -x in a step run body", () => {
    expect(violationsInDeployJobStepText("set -x\nnode scripts/run.mjs")).toContain(
      "set-x",
    );
  });

  it("rejects echo of PHYSIO_D1_DATABASE_ID outside add-mask", () => {
    expect(
      violationsInDeployJobStepText('echo "secret=${PHYSIO_D1_DATABASE_ID}"'),
    ).toContain("print-derived-d1-id");
  });

  it("rejects echo of TRIMMED outside add-mask (Q3b)", () => {
    expect(violationsInDeployJobStepText('echo "leak=${TRIMMED}"')).toContain(
      "print-derived-d1-id",
    );
  });

  it("rejects printf of TRIMMED outside add-mask (Q3c)", () => {
    expect(violationsInDeployJobStepText('printf "%s" "${TRIMMED}"')).toContain(
      "print-derived-d1-id",
    );
  });

  it("rejects upload-artifact in any deploy job step (Q12)", () => {
    expect(
      violationsInDeployJobStepText("- uses: actions/upload-artifact@v4"),
    ).toContain("upload-artifact");
  });

  it("rejects cat in the migrations step run body (Q13)", () => {
    expect(
      violationsInDeployJobStepText(
        "set -euo pipefail\ncat wrangler.ci.jsonc\nnpx wrangler d1 migrations apply",
      ),
    ).toContain("cat-wrangler-config");
  });

  it("rejects ACTIONS_STEP_DEBUG", () => {
    expect(violationsInDeployJobStepText("env:\n  ACTIONS_STEP_DEBUG: true")).toContain(
      "actions-step-debug",
    );
  });

  it("rejects head of wrangler.ci.jsonc", () => {
    expect(violationsInDeployJobStepText("head wrangler.ci.jsonc")).toContain(
      "head-wrangler-config",
    );
  });

  it("rejects grep of wrangler.ci.jsonc", () => {
    expect(
      violationsInDeployJobStepText("grep database_id wrangler.ci.jsonc"),
    ).toContain("grep-wrangler-config");
  });

  it("rejects writing wrangler.ci.jsonc into GITHUB_STEP_SUMMARY", () => {
    expect(
      violationsInDeployJobStepText('cat wrangler.ci.jsonc >> "$GITHUB_STEP_SUMMARY"'),
    ).toContain("github-step-summary-wrangler-config");
  });
});

describe("Deploy job scans every step (DIDI-1146 B2)", () => {
  it("flags upload-artifact on a bare uses step without a name", () => {
    const workflow = fixtureDeployWorkflow(
      "      - uses: actions/upload-artifact@1234567890123456789012345678901234567890",
    );
    expect(violationsInDeployWorkflow(workflow)).toContain(
      "uses actions/upload-artifact@1234567890123456789012345678901234567890:upload-artifact",
    );
  });

  it("flags upload-artifact on a name-first uses step", () => {
    const workflow = fixtureDeployWorkflow(
      ["      - name: Upload config", "        uses: actions/upload-artifact@v4"].join(
        "\n",
      ),
    );
    expect(violationsInDeployWorkflow(workflow)).toContain(
      "Upload config:upload-artifact",
    );
  });

  it("flags a leak on the last deploy step", () => {
    const workflow = fixtureDeployWorkflow(
      [
        "      - name: Prepare Wrangler config (production D1 ID)",
        "        run: echo ok",
        "      - name: Final step",
        "        run: cat wrangler.ci.jsonc",
      ].join("\n"),
    );
    expect(violationsInDeployWorkflow(workflow)).toContain(
      "Final step:cat-wrangler-config",
    );
  });

  it("flags a leak on a non-Prepare run step", () => {
    const workflow = fixtureDeployWorkflow(
      [
        "      - name: Apply production D1 migrations",
        "        run: grep secret wrangler.ci.jsonc",
      ].join("\n"),
    );
    expect(violationsInDeployWorkflow(workflow)).toContain(
      "Apply production D1 migrations:grep-wrangler-config",
    );
  });

  it("flags a leak on a uses-only checkout step block", () => {
    const workflow = fixtureDeployWorkflow(
      [
        "      - uses: actions/checkout@1234567890123456789012345678901234567890",
        "      - name: Leak",
        "        run: head wrangler.ci.jsonc",
      ].join("\n"),
    );
    expect(violationsInDeployWorkflow(workflow)).toContain("Leak:head-wrangler-config");
    expect(deployJobSteps(workflow)).toHaveLength(2);
  });
});

function runCommittedPrepareStepUnderBash(physioD1DatabaseId: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(
    "bash",
    ["-eu", "-o", "pipefail", "-c", EXPECTED_PREPARE_WRANGLER_STEP_RUN],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, PHYSIO_D1_DATABASE_ID: physioD1DatabaseId },
    },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("Prepare deploy step bash validation (DIDI-1146)", () => {
  const valid = "00000000-0000-0000-0000-000000000002";

  it.each([
    ["uppercase", "00000000-0000-0000-0000-00000000000B"],
    ["uppercase second group", "00000000-AAAA-0000-0000-000000000002"],
    ["braced", "{00000000-0000-0000-0000-000000000002}"],
    ["brace-prefix only", "{00000000-0000-0000-0000-000000000002"],
    ["prefixed", "x00000000-0000-0000-0000-000000000002"],
    ["hyphenless", "00000000000000000000000000000002"],
    ["extra hyphen segment", "00000000-0000-0000-0000-0000-000000000002"],
    ["non-uuid", "not-a-uuid-value"],
    ["placeholder", "00000000-0000-0000-0000-000000000001"],
    ["newline", `${valid}\nline-two`],
  ])("rejects %s before masking", (_label, candidate) => {
    const result = runCommittedPrepareStepUnderBash(candidate);
    expect(result.status).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).not.toMatch(/::add-mask::/);
    if (_label === "newline") {
      expect(result.stderr).toContain("newline characters");
    }
    const secretMaterial = candidate.split("\n")[0]!;
    expect(combined).not.toContain(secretMaterial);
  });

  it("validates UUID before add-mask in the committed Prepare script", () => {
    const maskIndex = EXPECTED_PREPARE_WRANGLER_STEP_RUN.indexOf("::add-mask::");
    const grepIndex = EXPECTED_PREPARE_WRANGLER_STEP_RUN.indexOf("grep -Eq");
    expect(grepIndex).toBeGreaterThan(-1);
    expect(maskIndex).toBeGreaterThan(grepIndex);
  });

  it("uses an explicit lowercase hex class in the Prepare grep, not locale-sensitive a-f", () => {
    expect(EXPECTED_PREPARE_WRANGLER_STEP_RUN).toContain("[0123456789abcdef]");
    expect(EXPECTED_PREPARE_WRANGLER_STEP_RUN).not.toMatch(/grep -Eq '\^\[0-9a-f\]/);
  });
});

describe("workflow glob for production D1 secret scan (DIDI-1146)", () => {
  it("includes every non-deploy workflow file under .github/workflows (.yml and .yaml)", () => {
    const names = nonDeployWorkflowFilenames(WORKFLOWS_DIR);
    expect(names).toContain("ci.yml");
    expect(names).toContain("bootstrap.yml");
    expect(names).not.toContain(DEPLOY_WORKFLOW_FILENAME);
  });

  it("flags d1 migrations apply without other production D1 markers", () => {
    expect(
      workflowReferencesProductionD1("npx wrangler d1 migrations apply PHYSIO_DB"),
    ).toBe(true);
  });

  it("picks up a newly added workflow file in the scan set", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-workflow-glob-"));
    try {
      writeFileSync(join(tempDir, "ci.yml"), "name: ci\n");
      writeFileSync(join(tempDir, "extra-leak.yaml"), "d1 migrations apply\n");
      const flagged = workflowFilesReferencingProductionD1(tempDir);
      expect(flagged).toEqual(["extra-leak.yaml"]);
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

  it("constructs D1SqlStorage for Worker deps without requiring SQL on auth-only paths", async () => {
    const deps = await createWorkerAppDependencies({});
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
          compatibility_flags: ["nodejs_compat"],
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
    try {
      await server.listen();
      const worker = server.getWorker<{ PHYSIO_DB: unknown }>();
      await worker.applyD1Migrations("PHYSIO_DB");
      const env = await worker.getEnv();
      const deps = await createWorkerAppDependencies({
        PHYSIO_DB: env.PHYSIO_DB as never,
      });
      const sql = deps.sql;

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

      await sql.run(
        "CREATE TABLE IF NOT EXISTS d1_adapter_bool_probe (id TEXT PRIMARY KEY, active INTEGER NOT NULL)",
      );
      await sql.run("INSERT INTO d1_adapter_bool_probe (id, active) VALUES (?, ?)", [
        "bool-fixture",
        true,
      ]);
      expect(
        (
          await sql.first<{ active: number }>(
            "SELECT active FROM d1_adapter_bool_probe WHERE id = ?",
            ["bool-fixture"],
          )
        )?.active,
      ).toBe(1);
      await sql.run("UPDATE d1_adapter_bool_probe SET active = ? WHERE id = ?", [
        false,
        "bool-fixture",
      ]);
      expect(
        (
          await sql.first<{ active: number }>(
            "SELECT active FROM d1_adapter_bool_probe WHERE id = ?",
            ["bool-fixture"],
          )
        )?.active,
      ).toBe(0);

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
    } finally {
      await server.close();
      rmSync(persist, { recursive: true, force: true });
    }
    expect(existsSync(persist)).toBe(false);
  }, 120_000);

  it("cleans up the D1 adapter persist directory after the integration run", async () => {
    const persist = mkdtempSync(join(tmpdir(), "physio-d1-cleanup-probe-"));
    try {
      expect(existsSync(persist)).toBe(true);
    } finally {
      rmSync(persist, { recursive: true, force: true });
      expect(existsSync(persist)).toBe(false);
    }
  });
});

describe("deploy job step inventory", () => {
  it("lists each deploy job step for static scanning", () => {
    const steps = deployJobSteps(readDeployWorkflowText());
    expect(steps.map((step) => step.name)).toEqual([
      "uses actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0",
      "uses actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0",
      "npm ci",
      "Validate production auth secrets",
      "Prepare Wrangler config (production D1 ID)",
      "Apply production D1 migrations",
      "Put production Worker auth secrets",
      "Deploy to Cloudflare Workers",
    ]);
  });
});
