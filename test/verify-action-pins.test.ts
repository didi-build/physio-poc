import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectAllRemoteShaUses,
  collectUsesProblems,
  extractUsesEntries,
  isFullLineComment,
  lineContainsUsesToken,
  decodeYamlDoubleQuotedScalar,
  lineHasDoubleQuotedKeyWithBackslash,
  lineDecodesToUsesKey,
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
    VERIFY_ACTION_PINS_REPO_ROOT: options.repoRoot ?? REPO_ROOT,
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

function writePinnedWorkflow(
  workflowsDir: string,
  fileName: string,
  bodyLines: string[],
): void {
  writeFileSync(
    join(workflowsDir, fileName),
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

  it("skips full-line comment lines that mention uses", () => {
    expect(isFullLineComment("# uses: actions/checkout@main")).toBe(true);
    const yaml = ["jobs:", "  x:", "    steps:", "# uses: actions/checkout@main"].join(
      "\n",
    );
    expect(extractUsesEntries(yaml)).toEqual([]);
  });

  it("decodes mid-key YAML escapes that spell uses", () => {
    expect(decodeYamlDoubleQuotedScalar(String.raw`u\x73es`)).toBe("uses");
    expect(decodeYamlDoubleQuotedScalar(String.raw`\U00000075ses`)).toBe("uses");
    expect(decodeYamlDoubleQuotedScalar(String.raw`us\u0065s`)).toBe("uses");
    expect(lineHasDoubleQuotedKeyWithBackslash(String.raw`      "u\x73es": foo`)).toBe(
      true,
    );
    expect(
      lineDecodesToUsesKey(String.raw`      "u\x73es": actions/checkout@main`),
    ).toBe(true);
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

describe("verify-action-pins.mjs (DIDI-1163)", () => {
  it("fails closed without a token for bare id-first @v4 refs", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", ["      - uses: actions/checkout@v4"]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
        `      - {uses: actions/checkout@${PINNED_SHA}, with: {}}`,
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
    [
      "unicode escaped key",
      String.raw`      "\u0075ses": actions/checkout@1234567890123456789012345678901234567890`,
    ],
    [
      "hex escaped key",
      String.raw`      "\x75ses": actions/checkout@1234567890123456789012345678901234567890`,
    ],
  ])("fails closed on non-strict uses token form (%s)", (_label, line) => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-tokenless-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [line]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not exactly uses:/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it.each([
    ["u hex escape mid-key", String.raw`      "u\x73es": actions/checkout@main`],
    ["U long unicode escape", String.raw`      "\U00000075ses": actions/checkout@main`],
    ["u mid-word escape", String.raw`      "us\u0065s": actions/checkout@main`],
  ])("fails closed on escaped YAML uses key (%s)", (_label, escapedKeyLine) => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-escaped-key-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        `      - uses: actions/checkout@${PINNED_SHA}`,
        escapedKeyLine,
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/not exactly uses:/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed on YAML alias uses lines", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-alias-"));
    try {
      writePinnedWorkflow(tempDir, "bad.yml", [
        `      - uses: *pin${PINNED_SHA.slice(0, 8)}`,
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/anchors and aliases/);
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("ignores full-line commented uses lines", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-comment-"));
    try {
      writePinnedWorkflow(tempDir, "ok.yml", [
        "# uses: actions/checkout@main",
        `      - uses: docker://ghcr.io/org/app@sha256:1234567890123456789012345678901234567890123456789012345678901234`,
      ]);
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails unpinned uses inside a local composite action referenced from workflows layout", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-composite-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      const actionDir = join(tempDir, ".github", "actions", "comp");
      mkdirSync(workflowsDir, { recursive: true });
      mkdirSync(actionDir, { recursive: true });
      writeFileSync(
        join(actionDir, "action.yml"),
        [
          "name: comp",
          "runs:",
          "  using: composite",
          "  steps:",
          "    - uses: actions/checkout@v4",
        ].join("\n"),
      );
      writeFileSync(
        join(workflowsDir, "wf.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ./.github/actions/comp"].join(
          "\n",
        ),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        actionsDir: join(tempDir, ".github", "actions"),
        repoRoot: tempDir,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not accept a decoy action under the workflow directory when the real composite is unpinned", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-decoy-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      const realAction = join(tempDir, ".github", "actions", "comp");
      const decoyAction = join(workflowsDir, ".github", "actions", "comp");
      mkdirSync(realAction, { recursive: true });
      mkdirSync(decoyAction, { recursive: true });
      writeFileSync(
        join(realAction, "action.yml"),
        [
          "name: comp",
          "runs:",
          "  using: composite",
          "  steps:",
          "    - uses: actions/checkout@v4",
        ].join("\n"),
      );
      writeFileSync(
        join(decoyAction, "action.yml"),
        [
          "name: decoy",
          "runs:",
          "  using: composite",
          "  steps:",
          `    - uses: actions/checkout@${PINNED_SHA}`,
        ].join("\n"),
      );
      writeFileSync(
        join(workflowsDir, "wf.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ./.github/actions/comp"].join(
          "\n",
        ),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        actionsDir: join(tempDir, ".github", "actions"),
        repoRoot: tempDir,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when a workflow references a path outside the repository via dot segments", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-escape-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      const outside = join(tempDir, "outside");
      const outsideAction = join(outside, "action");
      mkdirSync(workflowsDir, { recursive: true });
      mkdirSync(outsideAction, { recursive: true });
      writeFileSync(
        join(outsideAction, "action.yml"),
        [
          "name: outside",
          "runs:",
          "  using: composite",
          "  steps:",
          `    - uses: actions/checkout@${PINNED_SHA}`,
        ].join("\n"),
      );
      writeFileSync(
        join(workflowsDir, "wf.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ./../../../outside/action"].join(
          "\n",
        ),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        actionsDir: join(tempDir, ".github", "actions"),
        repoRoot: tempDir,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("escape the repository");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allows local composite actions from real .github layout when action.yml pins are valid", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-local-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      const actionDir = join(tempDir, ".github", "actions", "local");
      mkdirSync(workflowsDir, { recursive: true });
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
      writeFileSync(
        join(workflowsDir, "ok.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ./.github/actions/local"].join(
          "\n",
        ),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        actionsDir: join(tempDir, ".github", "actions"),
        repoRoot: tempDir,
      });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allows local composite actions with action.yaml manifest", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-action-yaml-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      const actionDir = join(tempDir, ".github", "actions", "local");
      mkdirSync(workflowsDir, { recursive: true });
      mkdirSync(actionDir, { recursive: true });
      writeFileSync(
        join(actionDir, "action.yaml"),
        [
          "name: local",
          "runs:",
          "  using: composite",
          "  steps:",
          `    - uses: actions/checkout@${PINNED_SHA}`,
        ].join("\n"),
      );
      writeFileSync(
        join(workflowsDir, "ok.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ./.github/actions/local"].join(
          "\n",
        ),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        actionsDir: join(tempDir, ".github", "actions"),
        repoRoot: tempDir,
      });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allows a local reusable workflow when nested uses are pinned", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-reusable-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "called.yml"),
        [
          "jobs:",
          "  inner:",
          "    steps:",
          `      - uses: actions/checkout@${PINNED_SHA}`,
        ].join("\n"),
      );
      writeFileSync(
        join(workflowsDir, "caller.yml"),
        ["jobs:", "  call:", "    uses: ./.github/workflows/called.yml"].join("\n"),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        repoRoot: tempDir,
      });
      expect(result.status, result.stderr).toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails unpinned uses discovered by scanning .github/actions recursively", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-actions-scan-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      const actionDir = join(tempDir, ".github", "actions", "nested", "tool");
      mkdirSync(workflowsDir, { recursive: true });
      mkdirSync(actionDir, { recursive: true });
      writeFileSync(join(workflowsDir, "empty.yml"), "jobs: {}\n");
      writeFileSync(
        join(actionDir, "action.yml"),
        [
          "name: tool",
          "runs:",
          "  using: composite",
          "  steps:",
          "    - uses: actions/checkout@v4",
        ].join("\n"),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        actionsDir: join(tempDir, ".github", "actions"),
        repoRoot: tempDir,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("@v4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when a local composite action manifest is missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-missing-action-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      mkdirSync(workflowsDir, { recursive: true });
      writeFileSync(
        join(workflowsDir, "bad.yml"),
        ["jobs:", "  x:", "    steps:", "      - uses: ./.github/actions/missing"].join(
          "\n",
        ),
      );
      const result = runVerifyActionPins({
        workflowsDir,
        repoRoot: tempDir,
      });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      repoRoot: REPO_ROOT,
    });
    expect(remote.length).toBeGreaterThan(0);
  });

  it("passes SHA-pinned uses without a token on committed workflows", () => {
    const result = runVerifyActionPins({
      workflowsDir: join(REPO_ROOT, ".github/workflows"),
      repoRoot: REPO_ROOT,
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
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
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("collects every remote SHA pin for token verification, including nested composite manifests", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-collect-"));
    try {
      const workflowsDir = join(tempDir, ".github", "workflows");
      const actionDir = join(tempDir, ".github", "actions", "wrap");
      mkdirSync(workflowsDir, { recursive: true });
      mkdirSync(actionDir, { recursive: true });
      const shaA = "1234567890123456789012345678901234567890";
      const shaB = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
      writeFileSync(
        join(actionDir, "action.yml"),
        [
          "name: wrap",
          "runs:",
          "  using: composite",
          "  steps:",
          `    - uses: actions/cache@${shaB}`,
        ].join("\n"),
      );
      writeFileSync(
        join(workflowsDir, "mix.yml"),
        [
          "jobs:",
          "  x:",
          "    steps:",
          `      - uses: actions/checkout@${shaA} # v4.4.0`,
          "      - uses: ./.github/actions/wrap",
        ].join("\n"),
      );
      const refs = collectAllRemoteShaUses({
        workflowsDir,
        actionsDir: join(tempDir, ".github", "actions"),
        repoRoot: tempDir,
      });
      expect(refs.map((entry) => entry.sha).sort()).toEqual([shaA, shaB].sort());
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when the workflows directory is missing", () => {
    const result = runVerifyActionPins({
      workflowsDir: join(tmpdir(), "physio-missing-workflows-dir-never-created"),
      repoRoot: REPO_ROOT,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/missing directory|FAIL/);
  });

  it("fails when a workflow file is unreadable", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-action-pins-unreadable-"));
    try {
      mkdirSync(join(tempDir, "blocked.yml"), { recursive: true });
      const result = runVerifyActionPins({ workflowsDir: tempDir, repoRoot: tempDir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unreadable file");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
