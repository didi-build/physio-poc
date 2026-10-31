import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/verify-action-pins.mjs");

function runVerifyActionPins(options: {
  workflowsDir: string;
  env?: Record<string, string | undefined>;
}): { status: number | null; stderr: string; stdout: string } {
  const env: Record<string, string | undefined> = {
    ...process.env,
    VERIFY_ACTION_PINS_WORKFLOWS_DIR: options.workflowsDir,
  };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (options.env) {
    Object.assign(env, options.env);
  }
  const result = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env,
  });
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

describe("verify-action-pins.mjs (DIDI-1146)", () => {
  it("fails closed on a version tag ref without calling GitHub (no token)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "bad.yml"),
        "jobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n",
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("40-character commit SHA");
      expect(result.stderr).toContain("actions/checkout@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("passes SHA-pinned uses without a token on committed workflows", () => {
    const result = runVerifyActionPins({
      workflowsDir: join(REPO_ROOT, ".github/workflows"),
    });
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain("skipped tag verification");
  });
});
