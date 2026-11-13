import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  PHYSIO_PRODUCTION_R2_BUCKETS,
  PHYSIO_R2_BINDING,
  PHYSIO_R2_BUCKET_NAME,
} from "../scripts/lib/wrangler-r2-binding.mjs";
import {
  DEPLOY_WORKFLOW_FILENAME,
  nonDeployWorkflowFilenames,
} from "./helpers/production-deploy-workflow-guards.js";
import { D1_PLACEHOLDER_PRODUCTION } from "../scripts/lib/wrangler-d1-placeholders.mjs";

const REPO_ROOT = join(import.meta.dirname, "..");
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github/workflows");
const CREATE_PRODUCTION_DEPS_PATH = join(
  REPO_ROOT,
  "src/adapters/workers/create-worker-production-app-dependencies.ts",
);

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

describe("R2 binding stays out of committed wrangler.jsonc (DIDI-1040)", () => {
  it("does not declare r2_buckets or PHYSIO_MEDIA in wrangler.jsonc", () => {
    const text = readFileSync(WRANGLER_PATH, "utf8");
    const parsed = parseWranglerJsonc(text);
    expect(parsed.r2_buckets).toBeUndefined();
    expect(text).not.toContain(PHYSIO_R2_BINDING);
    expect(text).not.toContain(PHYSIO_R2_BUCKET_NAME);
  });
});

describe("prepare-wrangler-config injects production R2 binding (DIDI-1040)", () => {
  const FIXTURE_DATABASE_ID = "00000000-0000-0000-0000-000000000002";

  it("adds the physio-media R2 bucket binding to the deploy config output", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-r2-"));
    const outputPath = join(tempDir, "wrangler.ci.jsonc");
    try {
      const result = spawnSync(
        process.execPath,
        [
          join(REPO_ROOT, "scripts/prepare-wrangler-config.mjs"),
          "--output",
          outputPath,
        ],
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            PHYSIO_D1_DATABASE_ID: FIXTURE_DATABASE_ID,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      const parsed = parseWranglerJsonc(readFileSync(outputPath, "utf8"));
      expect(parsed.r2_buckets).toEqual(PHYSIO_PRODUCTION_R2_BUCKETS);
      expect((parsed.r2_buckets as { bucket_name: string }[])[0]?.bucket_name).toBe(
        PHYSIO_R2_BUCKET_NAME,
      );
      expect((parsed.r2_buckets as { binding: string }[])[0]?.binding).toBe(
        PHYSIO_R2_BINDING,
      );
      expect(readFileSync(outputPath, "utf8")).not.toContain(D1_PLACEHOLDER_PRODUCTION);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("non-deploy workflows never reference production R2 (DIDI-1040)", () => {
  it("omits PHYSIO_MEDIA and physio-media from CI and other workflow files", () => {
    for (const name of nonDeployWorkflowFilenames(WORKFLOWS_DIR)) {
      const text = readFileSync(join(WORKFLOWS_DIR, name), "utf8");
      expect(text, name).not.toContain(PHYSIO_R2_BINDING);
      expect(text, name).not.toContain(PHYSIO_R2_BUCKET_NAME);
      expect(text, name).not.toContain("r2_buckets");
    }
  });

  it("does not include the deploy workflow in the PR CI workflow scan set", () => {
    const names = nonDeployWorkflowFilenames(WORKFLOWS_DIR);
    expect(names).not.toContain(DEPLOY_WORKFLOW_FILENAME);
  });
});

describe("Worker production object storage wiring (DIDI-1040)", () => {
  it("requires PHYSIO_MEDIA and wires R2ObjectStorage in production deps", () => {
    const source = readFileSync(CREATE_PRODUCTION_DEPS_PATH, "utf8");
    expect(source).toContain("PHYSIO_MEDIA");
    expect(source).toContain("new R2ObjectStorage");
    expect(source).not.toMatch(/objects:\s*new InMemoryObjectStorage\(\)/);
  });
});
