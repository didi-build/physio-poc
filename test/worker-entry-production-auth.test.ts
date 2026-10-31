import { describe, expect, it, vi } from "vitest";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import { FailClosedAuthPort } from "../src/auth/fail-closed-auth-port.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import {
  missingWorkerProductionAuthEnvKeys,
  WORKER_PRODUCTION_AUTH_SECRET_ENV_NAMES,
  WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME,
} from "../src/auth/worker-production-auth-env.js";
import { WORKER_PRODUCTION_AUTH_MISCONFIG_LOG } from "../src/auth/worker-production-auth-config.js";
import {
  createWorkerAppDependencies,
  resetWorkerProductionAuthCacheForTests,
  type WorkerEnv,
} from "../src/adapters/workers/create-app-dependencies.js";
import { handleRequest, MCP_PATH } from "../src/http/app.js";
import worker from "../src/entry/worker.js";
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
import {
  buildWorkerProductionAuthEnv,
  createWorkerProductionAuthTestDeps,
  FIXTURE_GOOGLE_CLIENT_SECRET,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";

const WORKER_BASE = WORKER_PRODUCTION_TEST_BASE;
const FIXTURE_GOOGLE_CLIENT_ID = "fixture-worker-google-client-id";

const MALFORMED_WEB_APP_BASE_URL_WITH_USERINFO = (() => {
  const url = new URL("https://example.workers.dev");
  url.username = "user";
  url.password = "pass";
  return url.toString();
})();

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

function spyAllConsoleMethods() {
  return Object.fromEntries(
    CONSOLE_METHODS.map((method) => [
      method,
      vi.spyOn(console, method).mockImplementation(() => {}),
    ]),
  ) as Record<(typeof CONSOLE_METHODS)[number], ReturnType<typeof vi.spyOn>>;
}

function joinedConsoleOutput(
  spies: Record<(typeof CONSOLE_METHODS)[number], ReturnType<typeof vi.spyOn>>,
): string {
  return CONSOLE_METHODS.flatMap((method) => spies[method].mock.calls.flat()).join(" ");
}

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

describe("Worker production auth import graph (DIDI-1153)", () => {
  it("never reaches fake Google modules from the Worker entry", () => {
    const { violations, files } = assertWorkerProductionAuthImportGraph(process.cwd());
    expect(violations).toEqual([]);
    expect(files).toContain(
      "src/adapters/workers/create-worker-production-app-dependencies.ts",
    );
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

  it("flags create-better-auth in a production-style module (mutation)", () => {
    const entry =
      "test/fixtures/worker-auth-import-guard/mutations/production-imports-create-better-auth/entry.ts";
    const { violations } = scanWorkerAuthImportGraph({
      repoRoot: process.cwd(),
      entryPaths: [entry],
    });
    expect(violations.some((v) => v.module.includes("create-better-auth"))).toBe(true);
  });
});

describe("Worker entry production auth (DIDI-1153)", () => {
  it("uses BetterAuthPort when every production auth env value is present", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps();
    expect(deps.auth).toBeInstanceOf(BetterAuthPort);
    expect(deps.auth).not.toBeInstanceOf(FailClosedAuthPort);
    expect(deps.fakeGooglePreAuth).toBeUndefined();
    expect(deps.guardedAppWithoutSession).toBe("redirect");
    expect(deps.mcpBearerAuth).toBeDefined();
    expect(deps.config.auth.fakeGoogleProviderEnabled).toBe(false);

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
  });

  it("reuses the same production deps within an isolate when env is unchanged", async () => {
    resetWorkerProductionAuthCacheForTests();
    const { d1, storage } = await openWorkerAuthTestDatabase();
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 });
    const first = await createWorkerAppDependencies(env);
    const second = await createWorkerAppDependencies(env);
    expect(first.auth).toBe(second.auth);
  });

  it("ignores stray AUTH_BASE_URL in Worker env for issuer and trusted origin via worker.fetch", async () => {
    resetWorkerProductionAuthCacheForTests();
    const overrideAuthBase = "https://override.example";
    const { d1, storage } = await openWorkerAuthTestDatabase();
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const env = {
      ...buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 }),
      AUTH_BASE_URL: overrideAuthBase,
      BETTER_AUTH_URL: overrideAuthBase,
      BETTER_AUTH_TRUSTED_ORIGINS: overrideAuthBase,
    } as WorkerEnv;

    const signIn = await worker.fetch(
      new Request(`${WORKER_BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: new URL(WORKER_BASE).origin,
        },
        body: JSON.stringify({ provider: "google", callbackURL: "/programs" }),
      }),
      env,
    );
    expect(signIn.status).toBe(200);
    const payload = (await signIn.json()) as { url?: string };
    const redirectUri =
      new URL(payload.url ?? "").searchParams.get("redirect_uri") ?? "";
    expect(redirectUri).toContain(new URL(WORKER_BASE).hostname);
    expect(redirectUri).not.toContain(new URL(overrideAuthBase).hostname);

    const badCallback = await worker.fetch(
      new Request(`${WORKER_BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: new URL(WORKER_BASE).origin,
        },
        body: JSON.stringify({
          provider: "google",
          callbackURL: `${overrideAuthBase}/steal`,
        }),
      }),
      env,
    );
    expect(badCallback.status).toBe(403);
  });

  it.each([
    ...WORKER_PRODUCTION_AUTH_SECRET_ENV_NAMES,
    WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME,
  ])("keeps FailClosedAuthPort when %s is missing", async (missingKey) => {
    resetWorkerProductionAuthCacheForTests();
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

  it.each(WORKER_PRODUCTION_AUTH_SECRET_ENV_NAMES)(
    "treats whitespace-only %s as missing",
    async (name) => {
      resetWorkerProductionAuthCacheForTests();
      const { d1 } = await openWorkerAuthTestDatabase();
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        [name]: "   ",
      });
      expect(missingWorkerProductionAuthEnvKeys(env)).toContain(name);
      const deps = await createWorkerAppDependencies(env);
      expect(deps.auth).toBeInstanceOf(FailClosedAuthPort);
    },
  );

  it("never uses FakeAuthPort even when PHYSIO_USE_FAKE_GOOGLE_PROVIDER=true in env", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps({
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    } as Partial<WorkerEnv>);
    expect(deps.auth).toBeInstanceOf(BetterAuthPort);
    expect(deps.auth).not.toBeInstanceOf(FakeAuthPort);
    expect(deps.config.auth.fakeGoogleProviderEnabled).toBe(false);
  });

  it("does not mount fake Google routes when production auth is wired", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps();
    const response = await handleRequest(
      new Request(`${WORKER_BASE}/__fake-google/start`),
      deps,
    );
    expect(response.status).not.toBe(200);
  });

  it("routes production auth through worker.fetch with Google authorize URL", async () => {
    const { env } = await createWorkerProductionAuthTestDeps();
    const signIn = await worker.fetch(
      new Request(`${WORKER_BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: new URL(WORKER_BASE).origin,
        },
        body: JSON.stringify({ provider: "google", callbackURL: "/programs" }),
      }),
      env,
    );
    expect(signIn.status).toBe(200);
    const payload = (await signIn.json()) as { url?: string };
    expect(new URL(payload.url ?? "").hostname).toBe("accounts.google.com");
  });

  it("returns 503 for auth routes via worker.fetch when secrets are present but PHYSIO_DB is missing", async () => {
    resetWorkerProductionAuthCacheForTests();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const env = buildWorkerProductionAuthEnv();
    const response = await worker.fetch(
      new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
      env,
    );
    expect(response.status).toBe(503);
    const deps = await createWorkerAppDependencies(env);
    expect(deps.auth).toBeInstanceOf(FailClosedAuthPort);
    expect(logSpy).not.toHaveBeenCalledWith(WORKER_PRODUCTION_AUTH_MISCONFIG_LOG);
    logSpy.mockRestore();
  });

  it("returns 401 for MCP without a session when production auth is wired", async () => {
    const { env } = await createWorkerProductionAuthTestDeps();
    const mcp = await worker.fetch(new Request(`${WORKER_BASE}${MCP_PATH}`), env);
    expect(mcp.status).toBe(401);
    expect(mcp.headers.get("www-authenticate")?.toLowerCase()).toContain("bearer");
  });

  it("accepts a D1 binding bridged from sqlite for Better Auth tables", async () => {
    resetWorkerProductionAuthCacheForTests();
    const { storage } = await openWorkerAuthTestDatabase();
    const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
    await seedPractitioner(storage, undefined, FAKE_GOOGLE_ALLOWED_EMAIL);
    const deps = await createWorkerAppDependencies(
      buildWorkerProductionAuthEnv({ PHYSIO_DB: d1 }),
    );
    expect(deps.auth).toBeInstanceOf(BetterAuthPort);
  });

  describe("malformed production auth env fails closed without 500", () => {
    it.each([
      {
        label: "short BETTER_AUTH_SECRET",
        env: { BETTER_AUTH_SECRET: "too-short" },
      },
      {
        label: "http WEB_APP_BASE_URL",
        env: { WEB_APP_BASE_URL: "http://not-https.example" },
      },
      {
        label: "WEB_APP_BASE_URL with path",
        env: { WEB_APP_BASE_URL: "https://example.workers.dev/programs" },
      },
      {
        label: "WEB_APP_BASE_URL with query",
        env: { WEB_APP_BASE_URL: "https://example.workers.dev?x=1" },
      },
      {
        label: "WEB_APP_BASE_URL with fragment",
        env: { WEB_APP_BASE_URL: "https://example.workers.dev#x" },
      },
      {
        label: "WEB_APP_BASE_URL with userinfo",
        env: { WEB_APP_BASE_URL: MALFORMED_WEB_APP_BASE_URL_WITH_USERINFO },
      },
      {
        label: "WEB_APP_BASE_URL with trailing slash",
        env: { WEB_APP_BASE_URL: "https://example.workers.dev/" },
      },
      {
        label: "empty allowlist",
        env: { PHYSIO_ALLOWED_GOOGLE_EMAILS: "  ,  " },
      },
    ])("$label", async ({ env: overrides }) => {
      resetWorkerProductionAuthCacheForTests();
      const spies = spyAllConsoleMethods();
      const { d1 } = await openWorkerAuthTestDatabase();
      const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1, ...overrides });
      const health = await worker.fetch(new Request(`${WORKER_BASE}/health`), env);
      expect(health.status).toBe(200);
      const auth = await worker.fetch(
        new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
        env,
      );
      expect(auth.status).toBe(503);
      expect(spies.log).toHaveBeenCalledWith(WORKER_PRODUCTION_AUTH_MISCONFIG_LOG);
      expect(spies.log.mock.calls).toEqual([[WORKER_PRODUCTION_AUTH_MISCONFIG_LOG]]);
      for (const method of CONSOLE_METHODS) {
        if (method === "log") {
          continue;
        }
        expect(spies[method].mock.calls).toEqual([]);
      }
      const logged = joinedConsoleOutput(spies);
      expect(logged).not.toContain(PHYSIO_TEST_BETTER_AUTH_SECRET);
      expect(logged).not.toContain(FIXTURE_GOOGLE_CLIENT_SECRET);
      if (overrides.WEB_APP_BASE_URL) {
        expect(logged).not.toContain(String(overrides.WEB_APP_BASE_URL));
      }
      if (overrides.BETTER_AUTH_SECRET) {
        expect(logged).not.toContain(String(overrides.BETTER_AUTH_SECRET));
      }
      for (const method of CONSOLE_METHODS) {
        spies[method].mockRestore();
      }
    });

    it("logs misconfig at most once per isolate across repeated auth requests", async () => {
      resetWorkerProductionAuthCacheForTests();
      const spies = spyAllConsoleMethods();
      const { d1 } = await openWorkerAuthTestDatabase();
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        BETTER_AUTH_SECRET: "too-short",
      });
      await worker.fetch(
        new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
        env,
      );
      await worker.fetch(
        new Request(`${WORKER_BASE}/api/auth/sign-in/social`, { method: "POST" }),
        env,
      );
      expect(spies.log.mock.calls).toEqual([[WORKER_PRODUCTION_AUTH_MISCONFIG_LOG]]);
      for (const method of CONSOLE_METHODS) {
        spies[method].mockRestore();
      }
    });
  });
});

export { buildWorkerProductionAuthEnv };
