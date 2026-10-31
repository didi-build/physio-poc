import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectAllRemoteShaUses,
  collectUsesProblems,
  extractUsesEntries,
  lineContainsUsesToken,
  parseStrictUsesLine,
  validateUsesSpec,
} from "../scripts/lib/github-actions-uses-validation.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/verify-action-pins.mjs");
const PINNED_SHA = "1234567890123456789012345678901234567890";

function runVerifyActionPins(options: {
  workflowsDir: string;
  actionsDir?: string;
  repoRoot?: string;
  env?: Record<string, string | undefined>;
}): { status: number | null; stderr: string; stdout: string } {
  const env: Record<string, string | undefined> = {
    ...process.env,
    VERIFY_ACTION_PINS_WORKFLOWS_DIR: options.workflowsDir,
    VERIFY_ACTION_PINS_ACTIONS_DIR: options.actionsDir ?? "none",
    VERIFY_ACTION_PINS_REPO_ROOT: options.repoRoot ?? options.workflowsDir,
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

function writePinnedWorkflow(dir: string, fileName: string, bodyLines: string[]): void {
  writeFileSync(
    join(dir, fileName),
    ["jobs:", "  x:", "    steps:", ...bodyLines].join("\n"),
  );
}

describe("github-actions-uses-validation.mjs", () => {
  it("extracts name-first, id-first, and job-level uses from strict lines only", () => {
    const yaml = [
      "jobs:",
      "  reusable:",
      "    uses: org/repo/.github/workflows/x.yml@1234567890123456789012345678901234567890",
      "  build:",
      "    steps:",
      "      - uses: actions/checkout@1234567890123456789012345678901234567890",
      "      - name: Report",
      "        uses: dorny/test-reporter@1234567890123456789012345678901234567890",
      "      - id: cache",
      "        uses: actions/cache@1234567890123456789012345678901234567890",
    ].join("\n");
    const specs = extractUsesEntries(yaml).map((entry) => entry.spec);
    expect(specs).toEqual([
      "org/repo/.github/workflows/x.yml@1234567890123456789012345678901234567890",
      "actions/checkout@1234567890123456789012345678901234567890",
      "dorny/test-reporter@1234567890123456789012345678901234567890",
      "actions/cache@1234567890123456789012345678901234567890",
    ]);
  });

  it("does not treat flow mapping or JSON-style uses as strict uses lines", () => {
    const yaml = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - {uses: actions/cache@1234567890123456789012345678901234567890}",
      '      "uses": actions/checkout@1234567890123456789012345678901234567890',
    ].join("\n");
    expect(extractUsesEntries(yaml)).toEqual([]);
    expect(lineContainsUsesToken('      "uses": foo')).toBe(true);
    expect(parseStrictUsesLine('      "uses": foo')).toBeNull();
  });

  it("allows local and docker digest refs", () => {
    expect(validateUsesSpec("./.github/actions/local")).toEqual({
      ok: true,
      kind: "local",
    });
    expect(validateUsesSpec("../outside/action")).toEqual({
      ok: false,
      reason: "local action path must not escape the repository",
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
  it("fails closed without a token for bare id-first @v4 refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", ["      - uses: actions/checkout@v4"]);
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("actions/checkout@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed without a token when uses follows a step id on the next line", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        "      - id: checkout",
        "        uses: actions/checkout@v4",
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/bad\.yml:5/);
      expect(result.stderr).toContain("actions/checkout@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed without a token for name-first @main refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        "      - name: Deploy",
        "        uses: cloudflare/wrangler-action@main",
      ]);
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

  it("fails closed on flow mapping uses lines", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        "      - {uses: actions/checkout@12345678901234567890123456789012345678901, with: {}}",
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not exactly uses:/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "double-quoted key",
      '      "uses": actions/checkout@1234567890123456789012345678901234567890',
    ],
    [
      "single-quoted key",
      "      'uses': actions/checkout@1234567890123456789012345678901234567890",
    ],
    [
      "space before colon",
      "      uses : actions/checkout@1234567890123456789012345678901234567890",
    ],
  ])("fails closed on non-strict uses token form (%s)", (_label, line) => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-tokenless-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [line]);
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not exactly uses:/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed when the uses value is on the next line", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        "      - uses:",
        `        actions/checkout@${PINNED_SHA}`,
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not exactly uses:/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed on CRLF workflow files with strict uses lines", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-crlf-"));
    try {
      const body = [
        "jobs:\r",
        "  x:\r",
        "    steps:\r",
        "      - uses: actions/checkout@v4\r",
      ].join("");
      writeFileSync(join(tempDir, "bad.yml"), body);
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails unpinned uses inside a local composite action with actions dir enabled", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-composite-"));
    try {
      const workflowsDir = join(tempDir, "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      const compDir = join(tempDir, "comp");
      mkdirSync(compDir, { recursive: true });
      writeFileSync(
        join(compDir, "action.yml"),
        [
          "name: comp",
          "runs:",
          "  using: composite",
          "  steps:",
          "      - uses: actions/checkout@v4",
        ].join("\n"),
      );
      writeFileSync(
        join(workflowsDir, "wf.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ./../comp"].join("\n"),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        actionsDir: join(tempDir, "actions-empty"),
        repoRoot: tempDir,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when a workflow references a local action outside the repository root", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-escape-"));
    try {
      const workflowsDir = join(tempDir, "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "wf.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ../outside"].join("\n"),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        repoRoot: tempDir,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("escape the repository");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allows local composite actions when action.yml pins are valid", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-local-"));
    try {
      const actionDir = join(tempDir, ".github", "actions", "local");
      mkdirSync(actionDir, { recursive: true });
      writeFileSync(
        join(actionDir, "action.yml"),
        [
          "name: local",
          "runs:",
          "  using: composite",
          "  steps:",
          `    - uses: actions/checkout@${PINNED_SHA}`,
        ].join("\n"),
      );
      writePinnedWorkflow(tempDir, "ok.yml", ["      - uses: ./.github/actions/local"]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when a local composite action manifest is missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-missing-action-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        "      - uses: ./.github/actions/missing",
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing action.yml");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allows docker digest pins without a token", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "ok.yml", [
        "      - uses: docker://ghcr.io/org/app@sha256:1234567890123456789012345678901234567890123456789012345678901234",
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails on docker image tags without digest", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        "      - uses: docker://ghcr.io/org/app:latest",
      ]);
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
      repoRoot: REPO_ROOT,
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
      writePinnedWorkflow(tempDir, "bad.yml", [
        "      - uses: docker://ghcr.io/org/app@sha256:123456789012345678901234567890123456789012345678901234567890123",
      ]);
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
      writePinnedWorkflow(tempDir, "bad.yml", [
        `      - uses: actions/checkout@${shortSha}`,
      ]);
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
      writePinnedWorkflow(tempDir, "mix.yml", [
        `      - uses: actions/checkout@${shaA} # v4.4.0`,
        `      - uses: actions/cache@${shaB}`,
      ]);
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
