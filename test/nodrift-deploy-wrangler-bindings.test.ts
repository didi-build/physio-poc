import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { resolveNodriftCli } from "../scripts/lib/resolve-nodrift-cli.mjs";
import { PHYSIO_R2_BINDING } from "../scripts/lib/wrangler-r2-binding.mjs";
import {
  assertRecordedSpawnEnvIsMinimalCheck,
  assertRecordedSpawnEnvIsMinimalPrepare,
} from "./helpers/assert-recorded-minimal-spawn-env.js";
import { minimalChildProcessEnv } from "./helpers/minimal-child-process-env.js";
import {
  resetRecordedSpawnEnvsForTests,
  spawnSyncRecording,
} from "./helpers/spawn-sync-recording-for-tests.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const PREPARE_SCRIPT = join(REPO_ROOT, "scripts/prepare-wrangler-config.mjs");
const FIXTURE_DATABASE_ID = "00000000-0000-0000-0000-000000000002";
const ENV_LEAK_PROBE = "PHYSIO_DIDI_1240_SPAWN_ENV_PROBE";

function writePreparedDeployWranglerConfig(outputPath: string): void {
  const result = spawnSyncRecording(
    process.execPath,
    [PREPARE_SCRIPT, "--output", outputPath],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: minimalChildProcessEnv({
        PHYSIO_D1_DATABASE_ID: FIXTURE_DATABASE_ID,
      }),
    },
  );
  expect(result.status, String(result.stderr || result.stdout || "")).toBe(0);
}

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

/**
 * nodrift check 2 only reads bindings from the Wrangler config under `wrangler` in
 * nodrift.config.json (defaults to repo root, where committed wrangler.jsonc has no R2).
 * This test points check 2 at prepare-wrangler-config deploy output instead (no network).
 */
describe("nodrift check 2 vs production deploy wrangler (DIDI-1040)", () => {
  it("passes when deploy wrangler includes PHYSIO_MEDIA and map has r2.physio_media", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-nodrift-deploy-wrangler-"));
    const priorCloudflareToken = process.env.CLOUDFLARE_API_TOKEN;
    try {
      const deployWranglerPath = join(tempDir, "wrangler.jsonc");
      process.env[ENV_LEAK_PROBE] = "must-not-leak";
      process.env.CLOUDFLARE_API_TOKEN = "must-not-leak";
      resetRecordedSpawnEnvsForTests();
      writePreparedDeployWranglerConfig(deployWranglerPath);
      assertRecordedSpawnEnvIsMinimalPrepare(FIXTURE_DATABASE_ID);
      const deployParsed = parseWranglerJsonc(readFileSync(deployWranglerPath, "utf8"));
      const r2 = deployParsed.r2_buckets as { binding: string }[] | undefined;
      expect(r2?.some((entry) => entry.binding === PHYSIO_R2_BINDING)).toBe(true);

      const nodriftConfigPath = join(tempDir, "nodrift.config.json");
      writeFileSync(
        nodriftConfigPath,
        `${JSON.stringify(
          {
            map: "docs/privacy/data-map.yml",
            subprocessors: "docs/privacy/subprocessors.yml",
            migrations: "migrations",
            wrangler: tempDir,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      const resolved = resolveNodriftCli(REPO_ROOT);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) {
        return;
      }

      resetRecordedSpawnEnvsForTests();
      try {
        const check = spawnSyncRecording(
          process.execPath,
          [resolved.cliPath, "check", "--config", nodriftConfigPath],
          {
            cwd: REPO_ROOT,
            encoding: "utf8",
            env: minimalChildProcessEnv(),
          },
        );
        expect(check.status, String(check.stderr || check.stdout || "")).toBe(0);
        expect(check.stdout).toContain("check 2 (data stores vs map): ok (2 bindings)");
        expect(check.stdout).toContain("nodrift: ok");
        assertRecordedSpawnEnvIsMinimalCheck();
      } finally {
        delete process.env[ENV_LEAK_PROBE];
      }
    } finally {
      if (priorCloudflareToken === undefined) {
        delete process.env.CLOUDFLARE_API_TOKEN;
      } else {
        process.env.CLOUDFLARE_API_TOKEN = priorCloudflareToken;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
