import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_WORKER_AUTH_SECRET_NAMES,
  buildWorkerAuthSecretsPayload,
  serializeWorkerAuthSecretsBulkPayload,
} from "../scripts/lib/production-worker-auth-secrets.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const DEPLOY_WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/deploy-physio-mcp-worker.yml",
);
const PUT_SCRIPT = join(REPO_ROOT, "scripts/put-production-worker-secrets.mjs");

/** Literal DIDI-1044 / DIDI-1042 production Worker auth secret names (not imported from the list under test). */
const TICKET_WORKER_AUTH_SECRET_NAMES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "PHYSIO_ALLOWED_GOOGLE_EMAILS",
] as const;

const VALIDATE_STEP = "Validate production auth secrets";
const PREPARE_STEP = "Prepare Wrangler config (production D1 ID)";
const MIGRATE_STEP = "Apply production D1 migrations";
const PUT_STEP = "Put production Worker auth secrets";
const DEPLOY_STEP = "Deploy to Cloudflare Workers";

const ASSERT_RUN_LINE = "node scripts/assert-production-deploy-secrets.mjs";
const PUT_RUN_LINE =
  "node scripts/put-production-worker-secrets.mjs --config wrangler.ci.jsonc";

type WorkflowStep = {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  uses?: string;
  if?: string;
  "continue-on-error"?: boolean | string;
};

type DeployWorkflow = {
  env?: Record<string, unknown>;
  jobs: {
    deploy: {
      env?: Record<string, unknown>;
      steps: WorkflowStep[];
    };
  };
};

function loadDeployWorkflow(): DeployWorkflow {
  const doc = yaml.load(readFileSync(DEPLOY_WORKFLOW_PATH, "utf8"));
  if (!doc || typeof doc !== "object") {
    throw new Error("deploy workflow must be a mapping");
  }
  return doc as DeployWorkflow;
}

function stepByName(steps: WorkflowStep[], name: string): WorkflowStep {
  const step = steps.find((entry) => entry.name === name);
  if (!step) {
    throw new Error(`missing step: ${name}`);
  }
  return step;
}

function stepIndexByName(steps: WorkflowStep[], name: string): number {
  return steps.findIndex((entry) => entry.name === name);
}

function secretRef(name: string): string {
  return `\${{ secrets.${name} }}`;
}

function trimmedRunLines(run: string): string[] {
  return run
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function countAddMaskLines(run: string, envVar: string): number {
  const pattern = new RegExp(`^echo "::add-mask::\\$\\{${envVar}\\}"$`);
  return trimmedRunLines(run).filter((line) => pattern.test(line)).length;
}

function lineIndexTrimmed(run: string, exactLine: string): number {
  return trimmedRunLines(run).indexOf(exactLine);
}

describe("production deploy workflow structure (DIDI-1044 QA)", () => {
  const workflowText = readFileSync(DEPLOY_WORKFLOW_PATH, "utf8");
  const workflow = loadDeployWorkflow();
  const deployJob = workflow.jobs.deploy;
  const steps = deployJob.steps;
  const validateStep = stepByName(steps, VALIDATE_STEP);
  const putStep = stepByName(steps, PUT_STEP);

  it("pins the ticket auth secret name list for validate and upload", () => {
    expect([...PRODUCTION_WORKER_AUTH_SECRET_NAMES]).toEqual([
      ...TICKET_WORKER_AUTH_SECRET_NAMES,
    ]);
  });

  it("orders deploy steps validate < prepare < migrate < put < deploy", () => {
    const validateIdx = stepIndexByName(steps, VALIDATE_STEP);
    const prepareIdx = stepIndexByName(steps, PREPARE_STEP);
    const migrateIdx = stepIndexByName(steps, MIGRATE_STEP);
    const putIdx = stepIndexByName(steps, PUT_STEP);
    const deployIdx = stepIndexByName(steps, DEPLOY_STEP);
    for (const idx of [validateIdx, prepareIdx, migrateIdx, putIdx, deployIdx]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(validateIdx).toBeLessThan(prepareIdx);
    expect(prepareIdx).toBeLessThan(migrateIdx);
    expect(migrateIdx).toBeLessThan(putIdx);
    expect(putIdx).toBeLessThan(deployIdx);
  });

  it("keeps auth secrets out of workflow-wide and job-wide env", () => {
    expect(workflow.env).toBeUndefined();
    expect(deployJob.env).toBeUndefined();
  });

  it("does not use GitHub vars or per-step if conditions on the deploy job", () => {
    expect(workflowText).not.toMatch(/\$\{\{\s*vars\./);
    for (const step of steps) {
      expect(step.if).toBeUndefined();
    }
  });

  it("scopes each ticket auth secret to Validate and Put step env with exact keys", () => {
    const allowed = new Set([VALIDATE_STEP, PUT_STEP]);
    for (const step of steps) {
      if (!step.env) continue;
      for (const [key, value] of Object.entries(step.env)) {
        for (const name of TICKET_WORKER_AUTH_SECRET_NAMES) {
          if (value !== secretRef(name)) continue;
          expect(allowed.has(step.name ?? ""), `${step.name} ${key}`).toBe(true);
          expect(key).toBe(name);
        }
      }
    }
    for (const name of TICKET_WORKER_AUTH_SECRET_NAMES) {
      expect(validateStep.env?.[name]).toBe(secretRef(name));
      expect(putStep.env?.[name]).toBe(secretRef(name));
    }
  });

  it("masks each auth secret once on Validate after the guard and before the put script on Put", () => {
    const validateRun = validateStep.run ?? "";
    const guardIdx = lineIndexTrimmed(validateRun, ASSERT_RUN_LINE);
    expect(guardIdx).toBeGreaterThan(-1);
    for (const name of TICKET_WORKER_AUTH_SECRET_NAMES) {
      expect(countAddMaskLines(validateRun, name)).toBe(1);
      const maskIdx = lineIndexTrimmed(validateRun, `echo "::add-mask::\${${name}}"`);
      expect(maskIdx).toBeGreaterThan(guardIdx);
    }

    const putRun = putStep.run ?? "";
    const putIdx = lineIndexTrimmed(putRun, PUT_RUN_LINE);
    expect(putIdx).toBeGreaterThan(-1);
    for (const name of TICKET_WORKER_AUTH_SECRET_NAMES) {
      expect(countAddMaskLines(putRun, name)).toBe(1);
      const maskIdx = lineIndexTrimmed(putRun, `echo "::add-mask::\${${name}}"`);
      expect(maskIdx).toBeGreaterThan(-1);
      expect(maskIdx).toBeLessThan(putIdx);
    }
  });

  it("runs the guard before any add-mask echo in Validate and Put", () => {
    for (const step of [validateStep, putStep]) {
      const lines = trimmedRunLines(step.run ?? "");
      const guardIdx = lines.indexOf(ASSERT_RUN_LINE);
      const firstMaskIdx = lines.findIndex((line) =>
        line.startsWith('echo "::add-mask::'),
      );
      expect(guardIdx).toBeGreaterThan(-1);
      expect(firstMaskIdx).toBeGreaterThan(guardIdx);
    }
  });

  it("uses exactly one assert script invocation line in Validate", () => {
    const lines = trimmedRunLines(validateStep.run ?? "");
    const assertLines = lines.filter((line) =>
      line.includes("assert-production-deploy-secrets"),
    );
    expect(assertLines).toEqual([ASSERT_RUN_LINE]);
  });

  it("uses exactly one put script invocation line in Put", () => {
    const lines = trimmedRunLines(putStep.run ?? "");
    const putLines = lines.filter((line) =>
      line.includes("put-production-worker-secrets"),
    );
    expect(putLines).toEqual([PUT_RUN_LINE]);
  });

  it("never interpolates GitHub secrets in run command text", () => {
    for (const step of steps) {
      if (!step.run) continue;
      expect(step.run).not.toMatch(/\$\{\{\s*secrets\./);
    }
  });

  it("does not enable xtrace or continue-on-error on Validate or Put", () => {
    for (const step of [validateStep, putStep]) {
      const run = step.run ?? "";
      expect(run).not.toMatch(/\bset\s+-x\b/);
      expect(run).not.toMatch(/\bset\s+-o\s+xtrace\b/);
      expect(step["continue-on-error"]).not.toBe(true);
      expect(step["continue-on-error"]).not.toBe("true");
    }
  });

  it("invokes put-production-worker-secrets.mjs without wrangler secret argv in the workflow", () => {
    const run = putStep.run ?? "";
    expect(run).not.toMatch(/wrangler secret/);
    for (const name of TICKET_WORKER_AUTH_SECRET_NAMES) {
      expect(run).not.toContain(secretRef(name));
    }
  });
});

describe("Validate step multiline guard before masking (DIDI-1044 L1)", () => {
  it("does not print the second line of a multi-line secret when simulating the Validate run order", () => {
    const result = spawnSync(
      "bash",
      [
        "-c",
        `set -euo pipefail
export GOOGLE_CLIENT_ID="${FIXTURE_GOOGLE_CLIENT_ID}"
export GOOGLE_CLIENT_SECRET="${FIXTURE_GOOGLE_CLIENT_SECRET}"
export BETTER_AUTH_SECRET="line-one
line-two-at-least-32-characters-long"
export PHYSIO_ALLOWED_GOOGLE_EMAILS="kojo.allowed@example.com"
node scripts/assert-production-deploy-secrets.mjs
echo "::add-mask::\${BETTER_AUTH_SECRET}"`,
      ],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain("line-two-at-least-32-characters-long");
    expect(result.stderr).toContain(
      "BETTER_AUTH_SECRET must be a single line for production deploy.",
    );
  });
});

const FIXTURE_GOOGLE_CLIENT_ID = "fixture-google-client-id";
const FIXTURE_GOOGLE_CLIENT_SECRET = "fixture-google-client-secret";

describe("put-production-worker-secrets wrangler spawn (DIDI-1044 QA)", () => {
  it("passes secret bulk via stdin JSON from the script serializer with no secret argv", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-put-wrangler-stub-"));
    const recordArgs = join(tempDir, "args.txt");
    const recordStdin = join(tempDir, "stdin.txt");
    const stubWrangler = join(tempDir, "wrangler-stub.mjs");
    writeFileSync(
      stubWrangler,
      `import { appendFileSync } from "node:fs";
appendFileSync(process.env.PHYSIO_STUB_RECORD_ARGS, process.argv.slice(2).join("\\0") + "\\n");
let body = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { body += chunk; });
process.stdin.on("end", () => {
  appendFileSync(process.env.PHYSIO_STUB_RECORD_STDIN, body);
});
`,
    );
    const configPath = join(tempDir, "wrangler.ci.jsonc");
    writeFileSync(configPath, "{}");

    const env = {
      ...process.env,
      GOOGLE_CLIENT_ID: 'fixture"id',
      GOOGLE_CLIENT_SECRET: "fixture\\secret",
      BETTER_AUTH_SECRET: "fixture-$(ignored)-`ticks`-32-chars-min",
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "kojo.allowed@example.com",
      PHYSIO_WRANGLER_JS_PATH: stubWrangler,
      PHYSIO_STUB_RECORD_ARGS: recordArgs,
      PHYSIO_STUB_RECORD_STDIN: recordStdin,
    };

    const payload = buildWorkerAuthSecretsPayload(env);
    const expectedStdin = serializeWorkerAuthSecretsBulkPayload(payload);

    const result = spawnSync(process.execPath, [PUT_SCRIPT, "--config", configPath], {
      cwd: REPO_ROOT,
      env,
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);

    const argvLine = readFileSync(recordArgs, "utf8").trim();
    expect(argvLine).toBe(`secret\0bulk\0--config\0${resolve(configPath)}`);
    for (const value of Object.values(payload)) {
      expect(argvLine).not.toContain(value);
    }

    const stdin = readFileSync(recordStdin, "utf8");
    expect(stdin).toBe(expectedStdin);
    expect(JSON.parse(stdin)).toEqual(payload);
  });
});
