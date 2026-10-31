import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");
const DEPLOY_WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/deploy-physio-mcp-worker.yml",
);

const VALIDATE_STEP = "Validate production auth secrets";
const PUT_STEP = "Put production Worker auth secrets";
const MIGRATE_STEP = "Apply production D1 migrations";

const DEFAULT_GITHUB_SHELL = "bash -e {0}";

const FIXTURE = {
  GOOGLE_CLIENT_ID: "fixture-google-client-id",
  GOOGLE_CLIENT_SECRET: "fixture-google-client-secret",
  BETTER_AUTH_SECRET: "fixture-better-auth-secret-32chx",
  PHYSIO_ALLOWED_GOOGLE_EMAILS: "coach@example.com",
  CLOUDFLARE_API_TOKEN: "fixture-cloudflare-api-token",
  CLOUDFLARE_ACCOUNT_ID: "00000000-0000-4000-8000-000000000001",
};

const SENSITIVE_OUTPUT_VALUES = Object.values(FIXTURE);

type WorkflowStep = {
  name?: string;
  run?: string;
  shell?: string;
  env?: Record<string, string>;
};

type DeployWorkflow = {
  jobs: {
    deploy: {
      steps: WorkflowStep[];
    };
  };
};

function loadDeployWorkflowFrom(path: string): DeployWorkflow {
  const doc = yaml.load(readFileSync(path, "utf8"));
  if (!doc || typeof doc !== "object") {
    throw new Error("deploy workflow must be a mapping");
  }
  return doc as DeployWorkflow;
}

function stepByName(workflow: DeployWorkflow, stepName: string): WorkflowStep {
  const step = workflow.jobs.deploy.steps.find((entry) => entry.name === stepName);
  if (!step) {
    throw new Error(`missing step: ${stepName}`);
  }
  return step;
}

function createWranglerStubBin(tempDir: string): {
  binDir: string;
  logPath: string;
  readLog: () => string;
} {
  const binDir = join(tempDir, "bin");
  mkdirSync(binDir, { recursive: true });
  const logPath = join(tempDir, "wrangler-stub.log");
  writeFileSync(logPath, "", "utf8");
  writeFileSync(
    join(binDir, "wrangler"),
    `#!/usr/bin/env bash
set -uo pipefail
printf '%s\\n' "$@" >> "$WRANGLER_STUB_LOG"
if printf '%s' "$*" | grep -q -- '--remote'; then
  echo 'stub wrangler refuses --remote' >&2
  exit 99
fi
exit 0
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(binDir, "npx"),
    `#!/usr/bin/env bash
set -uo pipefail
if [ "$1" = "wrangler" ]; then
  shift
  exec wrangler "$@"
fi
echo "stub npx: unsupported invocation: $*" >&2
exit 127
`,
    { mode: 0o755 },
  );
  chmodSync(join(binDir, "wrangler"), 0o755);
  chmodSync(join(binDir, "npx"), 0o755);
  return {
    binDir,
    logPath,
    readLog: () => readFileSync(logPath, "utf8"),
  };
}

function writeNodeWranglerStub(stubPath: string): void {
  writeFileSync(
    stubPath,
    `import { appendFileSync } from "node:fs";
appendFileSync(process.env.WRANGLER_STUB_LOG, process.argv.slice(2).join("\\0") + "\\n");
if (process.argv.includes("--remote")) process.exit(99);
`,
    "utf8",
  );
}

function githubShellArgv(
  shellTemplate: string | undefined,
  scriptPath: string,
): string[] {
  const template = shellTemplate?.trim() || DEFAULT_GITHUB_SHELL;
  return template.split(/\s+/).map((token) => (token === "{0}" ? scriptPath : token));
}

function runGithubStepShell(
  runBlock: string,
  shellTemplate: string | undefined,
  env: NodeJS.ProcessEnv,
  binDir: string,
  logPath: string,
): ReturnType<typeof spawnSync> {
  const tempDir = mkdtempSync(join(tmpdir(), "physio-deploy-bash-"));
  const scriptPath = join(tempDir, "github-step.sh");
  writeFileSync(scriptPath, runBlock, "utf8");
  chmodSync(scriptPath, 0o755);
  const argv = githubShellArgv(shellTemplate, scriptPath);
  const command = argv[0];
  if (!command) {
    throw new Error("empty GitHub shell command");
  }
  return spawnSync(command, argv.slice(1), {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      WRANGLER_STUB_LOG: logPath,
    },
    encoding: "utf8",
  });
}

function shellText(value: ReturnType<typeof spawnSync>["stdout"]): string {
  return typeof value === "string" ? value : "";
}

function combinedOutput(result: ReturnType<typeof spawnSync>): string {
  return `${shellText(result.stdout)}\n${shellText(result.stderr)}`;
}

function assertSensitiveValuesOnlyOnMaskLines(output: string): void {
  for (const line of output.split("\n")) {
    if (line.trim().length === 0) continue;
    for (const value of SENSITIVE_OUTPUT_VALUES) {
      if (!line.includes(value)) continue;
      expect(line.trim()).toMatch(/^::add-mask::/);
    }
  }
}

function assertNoSensitiveValuesInOutput(output: string): void {
  for (const value of SENSITIVE_OUTPUT_VALUES) {
    expect(output).not.toContain(value);
  }
}

describe("production deploy Validate and Put bash integration (DIDI-1044 B2)", () => {
  const workflow = loadDeployWorkflowFrom(DEPLOY_WORKFLOW_PATH);
  const validateStep = stepByName(workflow, VALIDATE_STEP);
  const putStep = stepByName(workflow, PUT_STEP);
  const validateRun = validateStep.run ?? "";
  const putRun = putStep.run ?? "";
  const validateShell = validateStep.shell;
  const putShell = putStep.shell;
  const migrateRun = stepByName(workflow, MIGRATE_STEP).run ?? "";

  it("runs parsed Validate under the step shell and masks only on add-mask lines when preflight passes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-b2-validate-"));
    const { binDir, logPath, readLog } = createWranglerStubBin(tempDir);
    const result = runGithubStepShell(
      validateRun,
      validateShell,
      FIXTURE,
      binDir,
      logPath,
    );
    expect(result.status, combinedOutput(result)).toBe(0);
    assertSensitiveValuesOnlyOnMaskLines(combinedOutput(result));
    expect(readLog()).toBe("");
  });

  it("fails Validate under the step shell without masks, wrangler, migrate, or put when allowlist is invalid", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-b2-validate-fail-"));
    const { binDir, logPath, readLog } = createWranglerStubBin(tempDir);
    const stubWrangler = join(tempDir, "wrangler-stub.mjs");
    writeNodeWranglerStub(stubWrangler);
    const chained = `${validateRun}\n${migrateRun}\n${putRun}`;
    const result = runGithubStepShell(
      chained,
      validateShell,
      {
        ...FIXTURE,
        PHYSIO_ALLOWED_GOOGLE_EMAILS: "not-an-email",
        PHYSIO_WRANGLER_JS_PATH: stubWrangler,
      },
      binDir,
      logPath,
    );
    expect(result.status).not.toBe(0);
    assertNoSensitiveValuesInOutput(combinedOutput(result));
    const log = readLog();
    expect(log).not.toMatch(/secret\s+bulk/);
    expect(log).not.toContain("--remote");
  });

  it("runs parsed Put under the step shell with stub wrangler bulk and masks before put on stdout and stderr", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-b2-put-"));
    const { binDir, logPath, readLog } = createWranglerStubBin(tempDir);
    const configPath = join(tempDir, "wrangler.ci.jsonc");
    writeFileSync(configPath, "{}", "utf8");
    const putRunWithConfig = putRun.replaceAll("wrangler.ci.jsonc", configPath);
    const stubWrangler = join(tempDir, "wrangler-stub.mjs");
    writeNodeWranglerStub(stubWrangler);
    const result = runGithubStepShell(
      putRunWithConfig,
      putShell,
      {
        ...FIXTURE,
        PHYSIO_WRANGLER_JS_PATH: stubWrangler,
      },
      binDir,
      logPath,
    );
    expect(result.status, combinedOutput(result)).toBe(0);
    assertSensitiveValuesOnlyOnMaskLines(combinedOutput(result));
    const log = readLog();
    expect(log).toContain("secret");
    expect(log).toContain("bulk");
    expect(log).not.toContain("--remote");
  });

  it("fails Put under the step shell before stub wrangler when preflight fails", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-b2-put-fail-"));
    const { binDir, logPath, readLog } = createWranglerStubBin(tempDir);
    const configPath = join(tempDir, "wrangler.ci.jsonc");
    writeFileSync(configPath, "{}", "utf8");
    const putRunWithConfig = putRun.replaceAll("wrangler.ci.jsonc", configPath);
    const stubWrangler = join(tempDir, "wrangler-stub.mjs");
    writeNodeWranglerStub(stubWrangler);
    const result = runGithubStepShell(
      putRunWithConfig,
      putShell,
      {
        ...FIXTURE,
        PHYSIO_ALLOWED_GOOGLE_EMAILS: ",",
        PHYSIO_WRANGLER_JS_PATH: stubWrangler,
      },
      binDir,
      logPath,
    );
    expect(result.status).not.toBe(0);
    assertNoSensitiveValuesInOutput(combinedOutput(result));
    expect(readLog()).not.toContain("bulk");
  });
});
