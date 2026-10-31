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
const ASSERT_SCRIPT = join(REPO_ROOT, "scripts/assert-production-deploy-secrets.mjs");

const VALIDATE_STEP = "Validate production auth secrets";
const PUT_STEP = "Put production Worker auth secrets";

type WorkflowStep = {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  uses?: string;
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

function secretRef(name: string): string {
  return `\${{ secrets.${name} }}`;
}

function countAddMaskLines(run: string, envVar: string): number {
  const pattern = new RegExp(`^\\s*echo "::add-mask::\\$\\{${envVar}\\}"\\s*$`, "gm");
  return [...run.matchAll(pattern)].length;
}

describe("production deploy workflow structure (DIDI-1044 QA)", () => {
  const workflow = loadDeployWorkflow();
  const deployJob = workflow.jobs.deploy;
  const validateStep = stepByName(deployJob.steps, VALIDATE_STEP);
  const putStep = stepByName(deployJob.steps, PUT_STEP);

  it("keeps auth secrets out of workflow-wide and job-wide env", () => {
    expect(workflow.env).toBeUndefined();
    expect(deployJob.env).toBeUndefined();
  });

  it("scopes each auth secret to Validate and Put step env only", () => {
    const allowed = new Set([VALIDATE_STEP, PUT_STEP]);
    for (const step of deployJob.steps) {
      if (!step.env) continue;
      for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
        if (step.env[name] === undefined) continue;
        expect(allowed.has(step.name ?? ""), step.name).toBe(true);
        expect(step.env[name]).toBe(secretRef(name));
      }
    }
    for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
      expect(validateStep.env?.[name]).toBe(secretRef(name));
      expect(putStep.env?.[name]).toBe(secretRef(name));
    }
  });

  it("masks each auth secret once per Validate and Put run block", () => {
    for (const [step, label] of [
      [validateStep, "validate"],
      [putStep, "put"],
    ] as const) {
      expect(step.run, label).toBeTruthy();
      const run = step.run!;
      for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
        expect(countAddMaskLines(run, name), label).toBe(1);
      }
    }
  });

  it("never interpolates GitHub secrets in run command text", () => {
    for (const step of deployJob.steps) {
      if (!step.run) continue;
      expect(step.run).not.toMatch(/\$\{\{\s*secrets\./);
    }
  });

  it("runs the real assert script in Validate (not a no-op)", () => {
    const run = validateStep.run ?? "";
    expect(run).toMatch(/node scripts\/assert-production-deploy-secrets\.mjs\s*$/m);
    expect(run.trim()).not.toMatch(/^true\s*$/m);
    const stub = spawnSync(process.execPath, [ASSERT_SCRIPT], {
      cwd: REPO_ROOT,
      env: process.env,
      encoding: "utf8",
    });
    expect(stub.status).toBe(1);
    expect(stub.stderr).toContain(
      "GOOGLE_CLIENT_ID is required for production deploy.",
    );
  });

  it("does not enable xtrace or continue-on-error on Put", () => {
    const run = putStep.run ?? "";
    expect(run).not.toMatch(/\bset\s+-x\b/);
    expect(run).not.toMatch(/\bset\s+-o\s+xtrace\b/);
    expect(putStep["continue-on-error"]).not.toBe(true);
    expect(putStep["continue-on-error"]).not.toBe("true");
  });

  it("invokes put-production-worker-secrets.mjs without wrangler secret argv in the workflow", () => {
    const run = putStep.run ?? "";
    expect(run).toMatch(
      /node scripts\/put-production-worker-secrets\.mjs --config wrangler\.ci\.jsonc\s*$/m,
    );
    expect(run).not.toMatch(/wrangler secret/);
    for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
      expect(run).not.toContain(secretRef(name));
    }
  });
});

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
