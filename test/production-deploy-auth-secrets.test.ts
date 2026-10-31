import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkerAuthSecretsPayload,
  invalidProductionWorkerAuthSecretNames,
  missingProductionWorkerAuthSecretNames,
  PRODUCTION_WORKER_AUTH_SECRET_NAMES,
} from "../scripts/lib/production-worker-auth-secrets.mjs";
import {
  COMMITTED_WEB_APP_BASE_URL,
  isExactHttpsOrigin,
} from "../scripts/lib/wrangler-d1-placeholders.mjs";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { InvalidAuthConfigError, resolvePhysioAuthConfig } from "../src/http/config.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const ASSERT_SCRIPT = join(REPO_ROOT, "scripts/assert-production-deploy-secrets.mjs");
const PREPARE_SCRIPT = join(REPO_ROOT, "scripts/prepare-wrangler-config.mjs");
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");

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
  });

  it("fails the assert script when any secret is empty or whitespace-only", () => {
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

  it("rejects multi-line secret values without printing the value", () => {
    const multiline = runAssertScript({
      ...FIXTURE_SECRET_VALUES,
      BETTER_AUTH_SECRET: "line-one\nline-two-at-least-32-characters-long",
    });
    expect(multiline.status).toBe(1);
    expect(multiline.stderr).toContain(
      "BETTER_AUTH_SECRET must be a single line for production deploy.",
    );
    expect(multiline.stderr).not.toContain("line-one");
    expect(
      invalidProductionWorkerAuthSecretNames({
        BETTER_AUTH_SECRET: "a\nb",
      }),
    ).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("passes the assert script when all four secrets are non-empty single lines", () => {
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
  });
});

describe("committed production WEB_APP_BASE_URL (DIDI-1044 B1)", () => {
  it("pins the exact https workers.dev origin on vars.WEB_APP_BASE_URL", () => {
    const text = readFileSync(WRANGLER_PATH, "utf8");
    expect(text).toContain(`"WEB_APP_BASE_URL": "${COMMITTED_WEB_APP_BASE_URL}"`);
    expect(isExactHttpsOrigin(COMMITTED_WEB_APP_BASE_URL)).toBe(true);
  });

  it("rejects origins with path, query, fragment, or userinfo", () => {
    expect(isExactHttpsOrigin(`${COMMITTED_WEB_APP_BASE_URL}/programs`)).toBe(false);
    expect(isExactHttpsOrigin(`${COMMITTED_WEB_APP_BASE_URL}?x=1`)).toBe(false);
    expect(isExactHttpsOrigin(`${COMMITTED_WEB_APP_BASE_URL}#frag`)).toBe(false);
    const withUserinfo = new URL(COMMITTED_WEB_APP_BASE_URL);
    withUserinfo.username = "user";
    expect(isExactHttpsOrigin(withUserinfo.href)).toBe(false);
  });

  it("resolves Worker config webAppBaseUrl from WEB_APP_BASE_URL", () => {
    const deps = createWorkerAppDependencies({
      WEB_APP_BASE_URL: COMMITTED_WEB_APP_BASE_URL,
    });
    expect(deps.config.webAppBaseUrl).toBe(COMMITTED_WEB_APP_BASE_URL);
  });

  it("prepare-wrangler-config leaves WEB_APP_BASE_URL unchanged when substituting D1 only", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-prepare-wrangler-"));
    const outputPath = join(tempDir, "wrangler.ci.jsonc");
    execFileSync(process.execPath, [PREPARE_SCRIPT, "--output", outputPath], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PHYSIO_D1_DATABASE_ID: "22222222-2222-2222-2222-222222222222",
      },
      stdio: "pipe",
    });
    const text = readFileSync(outputPath, "utf8");
    expect(text).toContain(`"WEB_APP_BASE_URL": "${COMMITTED_WEB_APP_BASE_URL}"`);
  });
});

describe("Worker production fake Google hardcode (DIDI-1044 L4)", () => {
  it("forces fake Google provider off regardless of Worker env", () => {
    const deps = createWorkerAppDependencies({
      WEB_APP_BASE_URL: COMMITTED_WEB_APP_BASE_URL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    });
    expect(deps.config.auth.fakeGoogleProviderEnabled).toBe(false);
    expect(deps.enableFakeGoogleRoutes).toBe(false);
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
