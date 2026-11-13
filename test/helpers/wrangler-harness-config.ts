import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { PHYSIO_PRODUCTION_R2_BUCKETS } from "../../scripts/lib/wrangler-r2-binding.mjs";

const REPO_ROOT = join(import.meta.dirname, "..", "..");
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");

/** Test harness only: simulated local R2 — never remote buckets or account credentials. */
export function assertHarnessR2BucketsAreLocalOnly(
  buckets: readonly Record<string, unknown>[],
): void {
  for (const entry of buckets) {
    if (entry.remote === true) {
      throw new Error("harness wrangler config must not set r2_buckets.remote: true");
    }
    if ("account_id" in entry && entry.account_id !== undefined) {
      throw new Error("harness wrangler config must not set r2_buckets.account_id");
    }
    if (
      "preview_bucket_name" in entry &&
      entry.preview_bucket_name !== undefined &&
      entry.preview_bucket_name !== entry.bucket_name
    ) {
      throw new Error(
        "harness wrangler config must not point at a remote preview bucket",
      );
    }
  }
}

export type WranglerHarnessConfigFixture = {
  configPath: string;
  cleanup: () => void;
};

export function writeHarnessWranglerConfigWithProductionBindings(): WranglerHarnessConfigFixture {
  const tempDir = mkdtempSync(join(tmpdir(), "physio-wrangler-harness-"));
  const errors: ParseError[] = [];
  const parsed = parseJsonc(readFileSync(WRANGLER_PATH, "utf8"), errors, {
    allowTrailingComma: true,
  });
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
  const config = parsed as Record<string, unknown>;
  config.main = join(REPO_ROOT, "src/entry/worker.ts");
  const d1Databases = config.d1_databases;
  if (
    Array.isArray(d1Databases) &&
    d1Databases[0] &&
    typeof d1Databases[0] === "object"
  ) {
    const entry = d1Databases[0] as Record<string, unknown>;
    entry.migrations_dir = join(REPO_ROOT, "migrations");
  }
  const assets = config.assets;
  if (assets && typeof assets === "object" && !Array.isArray(assets)) {
    (assets as Record<string, unknown>).directory = join(REPO_ROOT, "dist/ui");
  }
  assertHarnessR2BucketsAreLocalOnly(
    PHYSIO_PRODUCTION_R2_BUCKETS as readonly Record<string, unknown>[],
  );
  config.r2_buckets = PHYSIO_PRODUCTION_R2_BUCKETS;
  const configPath = join(tempDir, "wrangler.harness.jsonc");
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return {
    configPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}
