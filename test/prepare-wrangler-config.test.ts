import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { D1_PLACEHOLDER_PRODUCTION } from "../scripts/lib/wrangler-d1-placeholders.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/prepare-wrangler-config.mjs");
const FIXTURE_DATABASE_ID = "00000000-0000-0000-0000-000000000002";
const FIXTURE_UPPERCASE_ID = "00000000-0000-0000-0000-00000000000B";
const FIXTURE_NON_UUID = "not-a-uuid-value";

function runPrepareWranglerConfig(options: {
  databaseId?: string;
  outputPath: string;
}): { status: number | null; stderr: string; stdout: string } {
  const env = { ...process.env };
  if (options.databaseId === undefined) {
    delete env.PHYSIO_D1_DATABASE_ID;
  } else {
    env.PHYSIO_D1_DATABASE_ID = options.databaseId;
  }
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, "--output", options.outputPath],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env,
    },
  );
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function assertOutputOmitsSecretMaterial(output: string, secretMaterial: string): void {
  expect(output).not.toContain(secretMaterial);
}

describe("prepare-wrangler-config.mjs (DIDI-1146)", () => {
  it("substitutes a valid lowercase UUID secret into the output config", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.out.jsonc");
    try {
      const result = runPrepareWranglerConfig({
        databaseId: FIXTURE_DATABASE_ID,
        outputPath,
      });
      expect(result.status, result.stderr).toBe(0);
      const text = readFileSync(outputPath, "utf8");
      expect(text).toContain(FIXTURE_DATABASE_ID);
      expect(text).not.toContain(D1_PLACEHOLDER_PRODUCTION);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects a secret with leading or trailing whitespace without echoing the value", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.out.jsonc");
    const padded = `  ${FIXTURE_DATABASE_ID}  `;
    try {
      const result = runPrepareWranglerConfig({
        databaseId: padded,
        outputPath,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("leading or trailing whitespace");
      assertOutputOmitsSecretMaterial(result.stderr, FIXTURE_DATABASE_ID);
      assertOutputOmitsSecretMaterial(result.stdout, FIXTURE_DATABASE_ID);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects an empty secret", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.out.jsonc");
    try {
      const result = runPrepareWranglerConfig({
        databaseId: "",
        outputPath,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("PHYSIO_D1_DATABASE_ID is required.");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects whitespace-only secret values", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.out.jsonc");
    try {
      const result = runPrepareWranglerConfig({
        databaseId: "   ",
        outputPath,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("leading or trailing whitespace");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects a secret that is not UUID-shaped without echoing the value", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.out.jsonc");
    try {
      const result = runPrepareWranglerConfig({
        databaseId: FIXTURE_NON_UUID,
        outputPath,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "PHYSIO_D1_DATABASE_ID must be a lowercase UUID.",
      );
      assertOutputOmitsSecretMaterial(result.stderr, FIXTURE_NON_UUID);
      assertOutputOmitsSecretMaterial(result.stdout, FIXTURE_NON_UUID);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects uppercase UUID letters without echoing the value", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.out.jsonc");
    try {
      const result = runPrepareWranglerConfig({
        databaseId: FIXTURE_UPPERCASE_ID,
        outputPath,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "PHYSIO_D1_DATABASE_ID must be a lowercase UUID.",
      );
      assertOutputOmitsSecretMaterial(result.stderr, FIXTURE_UPPERCASE_ID);
      assertOutputOmitsSecretMaterial(result.stdout, FIXTURE_UPPERCASE_ID);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects embedded newlines without echoing the value", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.out.jsonc");
    const multiline = `${FIXTURE_DATABASE_ID}\nsecond-line`;
    try {
      const result = runPrepareWranglerConfig({
        databaseId: multiline,
        outputPath,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("newline characters");
      assertOutputOmitsSecretMaterial(result.stderr, FIXTURE_DATABASE_ID);
      assertOutputOmitsSecretMaterial(result.stderr, "second-line");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
