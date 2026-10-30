import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { AUTH_REFUSAL_MESSAGE } from "../src/http/auth-pages.js";
import { handleRequest } from "../src/http/app.js";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { InvalidAuthConfigError, resolvePhysioAuthConfig } from "../src/http/config.js";
import type { AppDependencies } from "../src/http/app.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

const BASE = "http://127.0.0.1:8787";

class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(response: Response): void {
    const raw = response.headers.get("set-cookie");
    if (!raw) {
      return;
    }
    for (const part of raw.split(/,(?=\s*[^;]+=)/)) {
      const [pair] = part.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value.length === 0) {
        this.values.delete(name);
      } else {
        this.values.set(name, value);
      }
    }
  }

  header(): string {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function requestWithJar(
  url: string,
  deps: AppDependencies,
  jar: CookieJar,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = jar.header();
  if (cookie) {
    headers.set("cookie", cookie);
  }
  const response = await handleRequest(
    new Request(url, {
      ...init,
      headers,
    }),
    deps,
  );
  jar.absorb(response);
  return response;
}

async function seedAllowedPractitioner(deps: AppDependencies): Promise<void> {
  await deps.sql.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    ["pract-kojo", FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
  );
}

async function createAuthTestDeps(
  allowedEmails = FAKE_GOOGLE_ALLOWED_EMAIL,
): Promise<AppDependencies> {
  const deps = await createNodeAppDependencies({
    AUTH_BASE_URL: BASE,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: allowedEmails,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
  });
  await seedAllowedPractitioner(deps);
  return deps;
}

async function completeGoogleSignIn(
  deps: AppDependencies,
  fixture: "allowed" | "refused",
): Promise<{ jar: CookieJar; lastResponse: Response }> {
  const jar = new CookieJar();
  const signIn = await requestWithJar(`${BASE}/api/auth/sign-in/social`, deps, jar, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
  });
  const payload = (await signIn.json()) as { url?: string };
  expect(payload.url).toBeTruthy();
  const authorizeUrl = new URL(payload.url ?? "");
  authorizeUrl.searchParams.set("fixture", fixture);
  let response = await requestWithJar(authorizeUrl.toString(), deps, jar);
  for (
    let step = 0;
    step < 8 && response.status >= 300 && response.status < 400;
    step += 1
  ) {
    const nextUrl = response.headers.get("location");
    if (!nextUrl) {
      break;
    }
    const resolved = new URL(nextUrl, BASE);
    response = await requestWithJar(resolved.toString(), deps, jar);
  }
  return { jar, lastResponse: response };
}

describe("Google sign-in (integration)", () => {
  it("allows the fixture account and sets a session cookie", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    expect(jar.header()).toContain("better-auth.session_token=");
    const practitioner = await deps.auth.getPractitioner(
      new Request(`${BASE}/exercises`, { headers: { cookie: jar.header() } }),
    );
    expect(practitioner?.practitionerId).toBe("pract-kojo");
  });

  it("refuses the fixture account with the refusal page and writes no auth rows", async () => {
    const deps = await createAuthTestDeps();
    const { lastResponse } = await completeGoogleSignIn(deps, "refused");
    expect(await lastResponse.text()).toContain(AUTH_REFUSAL_MESSAGE);
    const storage = deps.sql;
    if (!(storage instanceof BetterSqliteStorage)) {
      throw new Error("expected BetterSqliteStorage");
    }
    const count = storage
      .nativeDatabase()
      .prepare('SELECT count(*) as c FROM "user"')
      .get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects an empty allowlist", async () => {
    const deps = await createAuthTestDeps("");
    const { lastResponse } = await completeGoogleSignIn(deps, "allowed");
    expect(await lastResponse.text()).toContain(AUTH_REFUSAL_MESSAGE);
  });

  it("cannot enable the fake Google provider in production config", () => {
    expect(() =>
      resolvePhysioAuthConfig({
        fakeGoogleProvider: "true",
        nodeEnv: "production",
      }),
    ).toThrow(InvalidAuthConfigError);
  });

  it("rejects API and MCP requests without a session", async () => {
    const deps = await createAuthTestDeps();
    const api = await handleRequest(new Request(`${BASE}/api/unknown`), deps);
    expect(api.status).toBe(401);
    const mcp = await handleRequest(new Request(`${BASE}/mcp`), deps);
    expect(mcp.status).toBe(401);
  });

  it("keeps health and the public link page open without a session", async () => {
    const deps = await createAuthTestDeps();
    const health = await handleRequest(new Request(`${BASE}/health`), deps);
    expect(health.status).toBe(200);
    const link = await handleRequest(new Request(`${BASE}/l/demo-code`), deps);
    expect(link.status).not.toBe(401);
  });

  it("clears the session cookie on sign out", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    const signedOut = await requestWithJar(`${BASE}/api/auth/sign-out`, deps, jar, {
      method: "POST",
    });
    expect(signedOut.headers.get("set-cookie")?.toLowerCase()).toMatch(/max-age=0/);
  });

  it("redirects signed-out deep links through sign-in and preserves returnTo", async () => {
    const deps = await createAuthTestDeps();
    const response = await handleRequest(new Request(`${BASE}/programs`), deps);
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
    expect(location).toContain(encodeURIComponent("/programs"));
  });

  it("rejects off-site returnTo values", async () => {
    const { normalizeReturnTo } = await import("../src/auth/return-to.js");
    expect(normalizeReturnTo("//evil.example")).toBe("/");
    expect(normalizeReturnTo("https://evil.example/x")).toBe("/");
  });
});

describe("FakeAuthPort session cookie flags", () => {
  it("uses HttpOnly, Secure and SameSite=Lax", () => {
    const port = new FakeAuthPort({
      practitioner: {
        practitionerId: "p1",
        email: "a@example.com",
        displayName: "Kojo",
      },
    });
    const header = port.createSessionCookieHeader();
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
  });
});
