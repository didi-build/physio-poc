import { describe, expect, it } from "vitest";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import { FailClosedAuthPort } from "../src/auth/fail-closed-auth-port.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import {
  missingWorkerProductionAuthEnvKeys,
  WORKER_PRODUCTION_AUTH_SECRET_ENV_NAMES,
  WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME,
} from "../src/auth/worker-production-auth-env.js";
import {
  createWorkerAppDependencies,
  type WorkerEnv,
} from "../src/adapters/workers/create-app-dependencies.js";
import { handleRequest, MCP_PATH } from "../src/http/app.js";
import worker from "../src/entry/worker.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import {
  d1DatabaseFromSqlite,
  openWorkerAuthTestDatabase,
  seedPractitioner,
} from "./helpers/worker-auth-d1-fixture.js";
import {
  assertWorkerProductionAuthImportGraph,
  scanWorkerAuthImportGraph,
} from "../scripts/lib/worker-auth-import-guard.mjs";

const WORKER_BASE = "https://example.workers.dev";
const FIXTURE_GOOGLE_CLIENT_ID = "fixture-worker-google-client-id";
const FIXTURE_GOOGLE_CLIENT_SECRET = "fixture-worker-google-client-secret";

function clearWorkerProductionAuthEnvKey(
  env: WorkerEnv,
  missingKey: string,
): WorkerEnv {
  const next = { ...env };
  switch (missingKey) {
    case WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME:
      next.WEB_APP_BASE_URL = "";
      break;
    case "GOOGLE_CLIENT_ID":
      next.GOOGLE_CLIENT_ID = "";
      break;
    case "GOOGLE_CLIENT_SECRET":
      next.GOOGLE_CLIENT_SECRET = "";
      break;
    case "BETTER_AUTH_SECRET":
      next.BETTER_AUTH_SECRET = "";
      break;
    case "PHYSIO_ALLOWED_GOOGLE_EMAILS":
      next.PHYSIO_ALLOWED_GOOGLE_EMAILS = "";
      break;
    default:
      break;
  }
  return next;
}

export function buildWorkerProductionAuthEnv(
  overrides: Partial<WorkerEnv> = {},
): WorkerEnv {
  return {
    WEB_APP_BASE_URL: WORKER_BASE,
    BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: FIXTURE_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: FIXTURE_GOOGLE_CLIENT_SECRET,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
    ...overrides,
  };
}

describe("Worker production auth import graph (DIDI-1153)", () => {
  it("never reaches fake Google modules from the Worker entry", () => {
    const { violations } = assertWorkerProductionAuthImportGraph(process.cwd());
    expect(violations).toEqual([]);
  });

  it("flags fake-google imports reachable from the Worker entry (mutation)", () => {
    const entry =
      "test/fixtures/worker-auth-import-guard/mutations/fake-google-import/entry.ts";
    const { violations } = scanWorkerAuthImportGraph({
      repoRoot: process.cwd(),
      entryPaths: [entry],
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.module.includes("fake-google"))).toBe(true);
  });
});

describe("Worker entry production auth (DIDI-1153)", () => {
  it("uses BetterAuthPort when every production auth env value is present", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });
    const deps = await createWorkerAppDependencies(env);
    expect(deps.auth).toBeInstanceOf(BetterAuthPort);
    expect(deps.auth).not.toBeInstanceOf(FailClosedAuthPort);
    expect(deps.enableFakeGoogleRoutes).toBe(false);
    expect(deps.guardedAppWithoutSession).toBe("redirect");

    const signIn = await handleRequest(
      new Request(`${WORKER_BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: new URL(WORKER_BASE).origin,
        },
        body: JSON.stringify({ provider: "google", callbackURL: "/programs" }),
      }),
      deps,
    );
    expect(signIn.status).toBe(200);
    const payload = (await signIn.json()) as { url?: string };
    const authorizeUrl = new URL(payload.url ?? "");
    expect(authorizeUrl.hostname).toBe("accounts.google.com");
    expect(authorizeUrl.searchParams.get("client_id")).toBe(FIXTURE_GOOGLE_CLIENT_ID);
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      `${WORKER_BASE}/api/auth/callback/google`,
    );

    const metadata = await handleRequest(
      new Request(`${WORKER_BASE}/.well-known/oauth-authorization-server`),
      deps,
    );
    expect(metadata.status).toBe(200);
    const body = (await metadata.json()) as Record<string, unknown>;
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it.each([
    ...WORKER_PRODUCTION_AUTH_SECRET_ENV_NAMES,
    WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME,
  ])("keeps FailClosedAuthPort when %s is missing", async (missingKey) => {
    const { d1 } = await openWorkerAuthTestDatabase();
    const env = clearWorkerProductionAuthEnvKey(
      buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 }),
      missingKey,
    );
    expect(missingWorkerProductionAuthEnvKeys(env)).toContain(missingKey);
    const deps = await createWorkerAppDependencies(env);
    expect(deps.auth).toBeInstanceOf(FailClosedAuthPort);
    const response = await worker.fetch(
      new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
      env,
    );
    expect(response.status).toBe(503);
  });

  it("never uses FakeAuthPort even when PHYSIO_USE_FAKE_GOOGLE_PROVIDER=true", async () => {
    const { d1 } = await openWorkerAuthTestDatabase();
    const deps = await createWorkerAppDependencies(
      buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      }),
    );
    expect(deps.auth).toBeInstanceOf(BetterAuthPort);
    expect(deps.auth).not.toBeInstanceOf(FakeAuthPort);
  });

  it("does not mount fake Google routes when production auth is wired", async () => {
    const { d1 } = await openWorkerAuthTestDatabase();
    const deps = await createWorkerAppDependencies(
      buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 }),
    );
    const response = await handleRequest(
      new Request(`${WORKER_BASE}/__fake-google/start`),
      deps,
    );
    expect(response.status).not.toBe(200);
  });

  it("returns 401 for MCP without a session when production auth is wired", async () => {
    const { d1 } = await openWorkerAuthTestDatabase();
    const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });
    const mcp = await worker.fetch(new Request(`${WORKER_BASE}${MCP_PATH}`), env);
    expect(mcp.status).toBe(401);
  });

  it("falls back to FailClosedAuthPort when secrets are present but PHYSIO_DB is missing", async () => {
    const deps = await createWorkerAppDependencies(buildWorkerProductionAuthEnv());
    expect(deps.auth).toBeInstanceOf(FailClosedAuthPort);
  });

  it("accepts a D1 binding bridged from sqlite for Better Auth tables", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
    const deps = await createWorkerAppDependencies(
      buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 }),
    );
    expect(deps.auth).toBeInstanceOf(BetterAuthPort);
  });
});
