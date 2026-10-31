import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkerAuthSecretsPayload,
  missingProductionWorkerAuthSecretNames,
  PRODUCTION_WORKER_AUTH_SECRET_NAMES,
} from "../scripts/lib/production-worker-auth-secrets.mjs";
import {
  PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV,
  WEB_APP_BASE_URL_PLACEHOLDER,
} from "../scripts/lib/wrangler-d1-placeholders.mjs";
import { InvalidAuthConfigError, resolvePhysioAuthConfig } from "../src/http/config.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const ASSERT_SCRIPT = join(REPO_ROOT, "scripts/assert-production-deploy-secrets.mjs");
const PUT_SCRIPT = join(REPO_ROOT, "scripts/put-production-worker-secrets.mjs");
const PREPARE_SCRIPT = join(REPO_ROOT, "scripts/prepare-wrangler-config.mjs");
const DEPLOY_WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/deploy-physio-mcp-worker.yml",
);

const FIXTURE_SECRET_VALUES = {
  GOOGLE_CLIENT_ID: "fixture-google-client-id",
  GOOGLE_CLIENT_SECRET: "fixture-google-client-secret",
  BETTER_AUTH_SECRET: "fixture-better-auth-secret-at-least-32-chars",
  PHYSIO_ALLOWED_GOOGLE_EMAILS: "kojo.allowed@example.com",
};

function runAssertScript(env: NodeJS.ProcessEnv): {
  status: number | null;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [ASSERT_SCRIPT], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

describe("production Worker auth secret guard (DIDI-1044)", () => {
  it("reports every missing secret name without echoing values", () => {
    expect(missingProductionWorkerAuthSecretNames({})).toEqual(
      PRODUCTION_WORKER_AUTH_SECRET_NAMES,
    );
    const partial = {
      GOOGLE_CLIENT_ID: "x",
      BETTER_AUTH_SECRET: "y",
    };
    expect(missingProductionWorkerAuthSecretNames(partial).sort()).toEqual(
      ["GOOGLE_CLIENT_SECRET", "PHYSIO_ALLOWED_GOOGLE_EMAILS"].sort(),
    );
  });

  it("fails the assert script before deploy when any secret is empty", () => {
    const missing = runAssertScript({});
    expect(missing.status).toBe(1);
    for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
      expect(missing.stderr).toContain(`${name} is required for production deploy.`);
    }

    const blank = runAssertScript({
      ...FIXTURE_SECRET_VALUES,
      BETTER_AUTH_SECRET: "   ",
    });
    expect(blank.status).toBe(1);
    expect(blank.stderr).toContain(
      "BETTER_AUTH_SECRET is required for production deploy.",
    );
  });

  it("passes the assert script when all four secrets are non-empty", () => {
    const ok = runAssertScript(FIXTURE_SECRET_VALUES);
    expect(ok.status).toBe(0);
    expect(ok.stderr).toBe("");
  });

  it("buildWorkerAuthSecretsPayload trims values and includes every required key", () => {
    const payload = buildWorkerAuthSecretsPayload({
      GOOGLE_CLIENT_ID: "  id  ",
      GOOGLE_CLIENT_SECRET: "sec",
      BETTER_AUTH_SECRET: "  " + FIXTURE_SECRET_VALUES.BETTER_AUTH_SECRET + "  ",
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "a@example.com",
    });
    expect(Object.keys(payload).sort()).toEqual(
      [...PRODUCTION_WORKER_AUTH_SECRET_NAMES].sort(),
    );
    expect(payload.GOOGLE_CLIENT_ID).toBe("id");
    expect(payload.BETTER_AUTH_SECRET).toBe(FIXTURE_SECRET_VALUES.BETTER_AUTH_SECRET);
  });
});

describe("prepare-wrangler-config production WEB_APP_BASE_URL (DIDI-1044)", () => {
  it("substitutes WEB_APP_BASE_URL from PHYSIO_PRODUCTION_WEB_APP_BASE_URL", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.ci.jsonc");
    const webAppBaseUrl = "https://physio-poc.example-subdomain.workers.dev";
    execFileSync(process.execPath, [PREPARE_SCRIPT, "--output", outputPath], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PHYSIO_D1_DATABASE_ID: "22222222-2222-2222-2222-222222222222",
        [PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV]: webAppBaseUrl,
      },
      stdio: "pipe",
    });
    const text = readFileSync(outputPath, "utf8");
    expect(text).toContain(`"WEB_APP_BASE_URL": "${webAppBaseUrl}"`);
    expect(text).not.toContain(WEB_APP_BASE_URL_PLACEHOLDER);
    expect(text).toContain('"PHYSIO_USE_FAKE_GOOGLE_PROVIDER": "false"');
  });

  it("rejects a missing PHYSIO_PRODUCTION_WEB_APP_BASE_URL", () => {
    const result = spawnSync(
      process.execPath,
      [PREPARE_SCRIPT, "--output", join(tmpdir(), "missing-base-url.jsonc")],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PHYSIO_D1_DATABASE_ID: "22222222-2222-2222-2222-222222222222",
        },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `${PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV} is required.`,
    );
  });
});

describe("put-production-worker-secrets CLI (DIDI-1044)", () => {
  it("fails when secrets are missing", () => {
    const result = spawnSync(
      process.execPath,
      [PUT_SCRIPT, "--config", "wrangler.ci.jsonc"],
      {
        cwd: REPO_ROOT,
        env: process.env,
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "GOOGLE_CLIENT_ID is required for production deploy.",
    );
  });
});

describe("production deploy workflow auth wiring (DIDI-1044)", () => {
  const workflowText = readFileSync(DEPLOY_WORKFLOW_PATH, "utf8");

  it("validates secrets before prepare wrangler or remote steps", () => {
    const validateIdx = workflowText.indexOf(
      "- name: Validate production auth secrets",
    );
    const prepareIdx = workflowText.indexOf(
      "- name: Prepare Wrangler config (production D1 ID)",
    );
    const migrateIdx = workflowText.indexOf("- name: Apply production D1 migrations");
    const putIdx = workflowText.indexOf("- name: Put production Worker auth secrets");
    const deployIdx = workflowText.indexOf("- name: Deploy to Cloudflare Workers");
    expect(validateIdx).toBeGreaterThan(-1);
    expect(prepareIdx).toBeGreaterThan(validateIdx);
    expect(migrateIdx).toBeGreaterThan(prepareIdx);
    expect(putIdx).toBeGreaterThan(migrateIdx);
    expect(deployIdx).toBeGreaterThan(putIdx);
  });

  it("uses assert and put scripts instead of wrangler secret argv", () => {
    expect(workflowText).toContain("assert-production-deploy-secrets.mjs");
    expect(workflowText).toContain("put-production-worker-secrets.mjs");
    expect(workflowText).not.toMatch(/wrangler secret put/);
    expect(workflowText).not.toMatch(/wrangler secret bulk.*\$\{/);
  });

  it("passes PHYSIO_PRODUCTION_WEB_APP_BASE_URL from production environment variables", () => {
    expect(workflowText).toContain(
      "PHYSIO_PRODUCTION_WEB_APP_BASE_URL: ${{ vars.PHYSIO_PRODUCTION_WEB_APP_BASE_URL }}",
    );
  });
});

describe("resolvePhysioAuthConfig production fake Google guard (DIDI-1044)", () => {
  it("rejects PHYSIO_USE_FAKE_GOOGLE_PROVIDER in production", () => {
    expect(() =>
      resolvePhysioAuthConfig({
        fakeGoogleProvider: "true",
        nodeEnv: "production",
      }),
    ).toThrow(InvalidAuthConfigError);
  });
});
