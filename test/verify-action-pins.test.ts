import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectAllRemoteShaUses,
  collectUsesProblems,
  extractUsesEntries,
  validateUsesSpec,
} from "../scripts/lib/github-actions-uses-validation.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/verify-action-pins.mjs");

function runVerifyActionPins(options: {
  workflowsDir: string;
  actionsDir?: string;
  env?: Record<string, string | undefined>;
}): { status: number | null; stderr: string; stdout: string } {
  const env: Record<string, string | undefined> = {
    ...process.env,
    VERIFY_ACTION_PINS_WORKFLOWS_DIR: options.workflowsDir,
    VERIFY_ACTION_PINS_ACTIONS_DIR: options.actionsDir ?? "none",
  };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  if (options.env) Object.assign(env, options.env);
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

describe("github-actions-uses-validation.mjs", () => {
  it("extracts name-first, id-first, job-level and flow mapping uses", () => {
    const yaml = [
      "jobs:",
      "  reusable:",
      "    uses: org/repo/.github/workflows/x.yml@1234567890123456789012345678901234567890",
      "  build:",
      "    steps:",
      "      - uses: actions/checkout@1234567890123456789012345678901234567890",
      "      - name: Report",
      "        uses: dorny/test-reporter@1234567890123456789012345678901234567890",
      "      - {uses: actions/cache@1234567890123456789012345678901234567890, with: {path: .}}",
    ].join("\n");
    const specs = extractUsesEntries(yaml).map((entry) => entry.spec);
    expect(specs).toEqual([
      "org/repo/.github/workflows/x.yml@1234567890123456789012345678901234567890",
      "actions/checkout@1234567890123456789012345678901234567890",
      "dorny/test-reporter@1234567890123456789012345678901234567890",
      "actions/cache@1234567890123456789012345678901234567890",
    ]);
  });

  it("allows local and docker digest refs", () => {
    expect(validateUsesSpec("./.github/actions/local")).toEqual({
      ok: true,
      kind: "local",
    });
    expect(
      validateUsesSpec(
        "docker://ghcr.io/org/image@sha256:1234567890123456789012345678901234567890123456789012345678901234",
      ).ok,
    ).toBe(true);
    expect(validateUsesSpec("docker://ghcr.io/org/image:latest").ok).toBe(false);
  });
});

describe("verify-action-pins.mjs (DIDI-1146)", () => {
  it("fails closed without a token for id-first @v4 refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "bad.yml"),
        "jobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n",
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("actions/checkout@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed without a token for name-first @main refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "bad.yml"),
        [
          "jobs:",
          "  x:",
          "    steps:",
          "      - name: Deploy",
          "        uses: cloudflare/wrangler-action@main",
        ].join("\n"),
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("cloudflare/wrangler-action@main");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed without a token for job-level reusable workflows", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "bad.yaml"),
        ["jobs:", "  call:", "    uses: org/repo/.github/workflows/ci.yml@v4"].join(
          "\n",
        ),
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed without a token for flow mapping refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "bad.yml"),
        [
          "jobs:",
          "  x:",
          "    steps:",
          "      - {uses: actions/checkout@12345678901234567890123456789012345678901, with: {}}",
        ].join("\n"),
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allows local ./ uses without a token", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "ok.yml"),
        "jobs:\n  x:\n    steps:\n      - uses: ./.github/actions/local\n",
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allows docker digest pins without a token", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "ok.yml"),
        [
          "jobs:",
          "  x:",
          "    steps:",
          "      - uses: docker://ghcr.io/org/app@sha256:1234567890123456789012345678901234567890123456789012345678901234",
        ].join("\n"),
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails on docker image tags without digest", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "bad.yml"),
        "jobs:\n  x:\n    steps:\n      - uses: docker://ghcr.io/org/app:latest\n",
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("sha256");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("exits non-zero when zero uses refs are found", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-empty-"));
    try {
      writeFileSync(join(tempDir, "empty.yml"), "name: empty\non: push\njobs: {}\n");
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("No uses: refs found");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("finds at least one uses ref in committed workflows", () => {
    const scan = collectUsesProblems({
      workflowsDir: join(REPO_ROOT, ".github/workflows"),
      actionsDir: null,
    });
    expect(scan.totalUses).toBeGreaterThan(0);
    expect(scan.problems).toEqual([]);
    const remote = collectAllRemoteShaUses({
      workflowsDir: join(REPO_ROOT, ".github/workflows"),
      actionsDir: null,
    });
    expect(remote.length).toBeGreaterThan(0);
  });

  it("passes SHA-pinned uses without a token on committed workflows", () => {
    const result = runVerifyActionPins({
      workflowsDir: join(REPO_ROOT, ".github/workflows"),
    });
    expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
    expect(result.stdout).toContain("skipped tag verification");
  });

  it("fails on docker digest with wrong hex length", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "bad.yml"),
        [
          "jobs:",
          "  x:",
          "    steps:",
          "      - uses: docker://ghcr.io/org/app@sha256:123456789012345678901234567890123456789012345678901234567890123",
        ].join("\n"),
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("sha256");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed without a token for unpinned refs in .yaml workflows", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writeFileSync(
        join(tempDir, "scan-me.yaml"),
        ["jobs:", "  x:", "    uses: org/repo/.github/workflows/x.yml@main"].join("\n"),
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@main");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed without a token for 39-character short SHA refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    const shortSha = "123456789012345678901234567890123456789";
    expect(shortSha).toHaveLength(39);
    try {
      writeFileSync(
        join(tempDir, "bad.yml"),
        [
          "jobs:",
          "  x:",
          "    steps:",
          `      - uses: actions/checkout@${shortSha}`,
        ].join("\n"),
      );
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("collects every remote SHA pin for token verification, including lines without tag comments", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-collect-"));
    try {
      const shaA = "1234567890123456789012345678901234567890";
      const shaB = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
      writeFileSync(
        join(tempDir, "mix.yml"),
        [
          "jobs:",
          "  x:",
          "    steps:",
          `      - uses: actions/checkout@${shaA} # v4.4.0`,
          `      - uses: actions/cache@${shaB}`,
        ].join("\n"),
      );
      const refs = collectAllRemoteShaUses({ workflowsDir: tempDir, actionsDir: null });
      expect(refs.map((entry) => entry.sha).sort()).toEqual([shaA, shaB].sort());
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when the workflows directory is missing", () => {
    const result = runVerifyActionPins({
      workflowsDir: join(tmpdir(), "physio-missing-workflows-dir-never-created"),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing directory|FAIL/);
  });

  it("fails when a workflow file is unreadable", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-unreadable-"));
    try {
      mkdirSync(join(tempDir, "blocked.yml"), { recursive: true });
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unreadable file");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
