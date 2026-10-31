import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIN_PRODUCTION_BETTER_AUTH_SECRET_LENGTH,
  productionDeployWebAppBaseUrlProblemNames,
  readWebAppBaseUrlFromWranglerSource,
  resolveProductionWranglerSourcePath,
} from "../scripts/lib/production-deploy-preflight.mjs";
import { parseAllowedGoogleEmailsRaw } from "../scripts/lib/allowed-google-emails-deploy.mjs";
import {
  buildWorkerAuthSecretsPayload,
  invalidProductionWorkerAuthSecretNames,
  missingProductionWorkerAuthSecretNames,
  productionDeployBetterAuthSecretLengthProblemNames,
  PRODUCTION_WORKER_AUTH_SECRET_NAMES,
} from "../scripts/lib/production-worker-auth-secrets.mjs";
import {
  COMMITTED_WEB_APP_BASE_URL,
  isExactHttpsOrigin,
} from "../scripts/lib/wrangler-d1-placeholders.mjs";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { parseAllowedGoogleEmails } from "../src/auth/allowed-emails.js";
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

const FIXTURE_BETTER_AUTH_SECRET_31_CHARS = "fixture-better-auth-secret-31ch";
const FIXTURE_BETTER_AUTH_SECRET_32_CHARS = "fixture-better-auth-secret-32chx";

function assertStderrNamesVariablesOnly(stderr: string, forbiddenSubstrings: string[]) {
  for (const fragment of forbiddenSubstrings) {
    expect(stderr).not.toContain(fragment);
  }
}

function writeWranglerFixtureWithWebAppBaseUrl(
  dir: string,
  webAppBaseUrl: string,
): string {
  const base = readFileSync(WRANGLER_PATH, "utf8");
  const patched = base.replace(
    /"WEB_APP_BASE_URL":\s*"[^"]+"/,
    `"WEB_APP_BASE_URL": "${webAppBaseUrl}"`,
  );
  const path = join(dir, "wrangler.fixture.jsonc");
  writeFileSync(path, patched, "utf8");
  return path;
}

function runAssertScript(
  env: NodeJS.ProcessEnv,
  options?: { wranglerSourcePath?: string },
): {
  status: number | null;
  stderr: string;
} {
  const result = spawnSync(process.execPath, [ASSERT_SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      ...env,
      ...(options?.wranglerSourcePath
        ? { PHYSIO_WRANGLER_SOURCE_PATH: options.wranglerSourcePath }
        : {}),
    },
    encoding: "utf8",
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

describe("production Worker auth secret guard (DIDI-1044)", () => {
  it("pins the four ticket auth secret names for guard and upload", () => {
    expect([...PRODUCTION_WORKER_AUTH_SECRET_NAMES]).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "BETTER_AUTH_SECRET",
      "PHYSIO_ALLOWED_GOOGLE_EMAILS",
    ]);
  });

  it("reports every missing ticket secret name without echoing values", () => {
    expect(missingProductionWorkerAuthSecretNames({})).toEqual([
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "BETTER_AUTH_SECRET",
      "PHYSIO_ALLOWED_GOOGLE_EMAILS",
    ]);
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

describe("production deploy preflight (DIDI-1153 3(b))", () => {
  it("requires BETTER_AUTH_SECRET length 32, not 31, without echoing the value", () => {
    expect(FIXTURE_BETTER_AUTH_SECRET_31_CHARS).toHaveLength(31);
    expect(FIXTURE_BETTER_AUTH_SECRET_32_CHARS).toHaveLength(32);
    expect(MIN_PRODUCTION_BETTER_AUTH_SECRET_LENGTH).toBe(32);

    expect(
      productionDeployBetterAuthSecretLengthProblemNames({
        BETTER_AUTH_SECRET: FIXTURE_BETTER_AUTH_SECRET_31_CHARS,
      }),
    ).toEqual(["BETTER_AUTH_SECRET"]);
    expect(
      productionDeployBetterAuthSecretLengthProblemNames({
        BETTER_AUTH_SECRET: FIXTURE_BETTER_AUTH_SECRET_32_CHARS,
      }),
    ).toEqual([]);

    const tooShort = runAssertScript({
      ...FIXTURE_SECRET_VALUES,
      BETTER_AUTH_SECRET: FIXTURE_BETTER_AUTH_SECRET_31_CHARS,
    });
    expect(tooShort.status).toBe(1);
    expect(tooShort.stderr).toContain(
      "BETTER_AUTH_SECRET must be at least 32 characters for production deploy.",
    );
    assertStderrNamesVariablesOnly(tooShort.stderr, [
      FIXTURE_BETTER_AUTH_SECRET_31_CHARS,
    ]);

    const ok = runAssertScript({
      ...FIXTURE_SECRET_VALUES,
      BETTER_AUTH_SECRET: FIXTURE_BETTER_AUTH_SECRET_32_CHARS,
    });
    expect(ok.status).toBe(0);
  });

  it("requires committed WEB_APP_BASE_URL https origin without path, query, or fragment", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "physio-wrangler-preflight-"));

    const httpPath = writeWranglerFixtureWithWebAppBaseUrl(
      tempDir,
      "http://physio-poc.example.workers.dev",
    );
    const httpRun = runAssertScript(FIXTURE_SECRET_VALUES, {
      wranglerSourcePath: httpPath,
    });
    expect(httpRun.status).toBe(1);
    expect(httpRun.stderr).toContain(
      "WEB_APP_BASE_URL must be an https origin for production deploy.",
    );
    assertStderrNamesVariablesOnly(httpRun.stderr, [
      "http://physio-poc.example.workers.dev",
    ]);

    const withPath = writeWranglerFixtureWithWebAppBaseUrl(
      tempDir,
      "https://physio-poc.example.workers.dev/programs",
    );
    expect(
      productionDeployWebAppBaseUrlProblemNames(readFileSync(withPath, "utf8")),
    ).toEqual(["WEB_APP_BASE_URL"]);
    const pathRun = runAssertScript(FIXTURE_SECRET_VALUES, {
      wranglerSourcePath: withPath,
    });
    expect(pathRun.status).toBe(1);
    expect(pathRun.stderr).toContain(
      "WEB_APP_BASE_URL must be an https origin for production deploy.",
    );
    assertStderrNamesVariablesOnly(pathRun.stderr, ["/programs"]);

    expect(resolveProductionWranglerSourcePath({})).toBe(
      join(REPO_ROOT, "wrangler.jsonc"),
    );
    expect(
      readWebAppBaseUrlFromWranglerSource(readFileSync(WRANGLER_PATH, "utf8")),
    ).toBe(COMMITTED_WEB_APP_BASE_URL);
  });

  it("rejects empty and whitespace-only PHYSIO_ALLOWED_GOOGLE_EMAILS without echoing values", () => {
    const empty = runAssertScript({
      ...FIXTURE_SECRET_VALUES,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "",
    });
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain(
      "PHYSIO_ALLOWED_GOOGLE_EMAILS is required for production deploy.",
    );

    const fixtureAllowlist = FIXTURE_SECRET_VALUES.PHYSIO_ALLOWED_GOOGLE_EMAILS;
    const whitespace = runAssertScript({
      ...FIXTURE_SECRET_VALUES,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "   \t  ",
    });
    expect(whitespace.status).toBe(1);
    expect(whitespace.stderr).toContain(
      "PHYSIO_ALLOWED_GOOGLE_EMAILS is required for production deploy.",
    );
    assertStderrNamesVariablesOnly(whitespace.stderr, [fixtureAllowlist, "   \t  "]);
  });

  it("matches Worker allowlist comma split, trim, and empty-entry drop", () => {
    /** DIDI-1154: `a@.` and `a@x.` parity only; deploy shape rules may change later. */
    const parityInputs: Array<{ raw: string; note?: string }> = [
      { raw: "," },
      { raw: " , , " },
      { raw: "   " },
      { raw: "\t\t" },
      { raw: "\u00a0\u00a0" },
      { raw: "\ufeffcoach@example.com" },
      { raw: "a@example.com;b@c.example.org" },
      { raw: "Coach@Example.com" },
      { raw: " COACH@EXAMPLE.COM " },
      { raw: "coach@example.com" },
      { raw: "coach@example.com,admin@example.org" },
      { raw: ",coach@example.com," },
      { raw: "coach@example.com,,admin@example.org" },
      { raw: "a@example.com,b@c.example.org" },
      { raw: "coach@example.com\nadmin@example.org" },
      { raw: "  x@y.z  " },
      { raw: "not-an-email" },
      { raw: "ok@example.com,not-an-email" },
      { raw: "coach@localhost" },
      { raw: "fake@" },
      { raw: "@example.com" },
      { raw: "x@y.z" },
      { raw: "a@example.com,\tb@c.example.org" },
      { raw: "a@.", note: "DIDI-1154 current behaviour" },
      { raw: "a@x.", note: "DIDI-1154 current behaviour" },
      { raw: "coach@example.com\tadmin@example.org", note: "DIDI-1154 tab whitespace" },
    ];
    for (const { raw } of parityInputs) {
      expect([...parseAllowedGoogleEmailsRaw(raw)].sort()).toEqual(
        [...parseAllowedGoogleEmails(raw)].sort(),
      );
    }
  });

  it("rejects comma-only, whitespace-comma, invalid, mixed, and no-dot allowlists without echoing values", () => {
    const invalidMessage =
      "PHYSIO_ALLOWED_GOOGLE_EMAILS is invalid for production deploy.";
    for (const allowlist of [
      ",",
      " , , ",
      "not-an-email",
      "ok@example.com,not-an-email",
      "coach@localhost",
    ]) {
      const run = runAssertScript({
        ...FIXTURE_SECRET_VALUES,
        PHYSIO_ALLOWED_GOOGLE_EMAILS: allowlist,
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(invalidMessage);
      assertStderrNamesVariablesOnly(run.stderr, [allowlist]);
    }
    const ok = runAssertScript({
      ...FIXTURE_SECRET_VALUES,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "coach@example.com,admin@example.org",
    });
    expect(ok.status).toBe(0);
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
