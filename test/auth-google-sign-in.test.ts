import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import type { FakeGoogleFixture } from "../src/auth/fake-google-http.js";
import { AUTH_REFUSAL_MESSAGE } from "../src/http/auth-pages.js";
import { handleRequest } from "../src/http/app.js";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { InvalidAuthConfigError, resolvePhysioAuthConfig } from "../src/http/config.js";
import type { AppDependencies } from "../src/http/app.js";
import {
  generateOpaqueEntityId,
  validateOpaqueEntityId,
} from "../src/domain/opaque-entity-id.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

const BASE = "http://127.0.0.1:8787";

let seededAllowedPractitionerId = generateOpaqueEntityId();

class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(response: Response): void {
    const parts =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];
    for (const raw of parts) {
      for (const segment of raw.split(/,(?=\s*[^;]+=)/)) {
        const [pair] = segment.split(";");
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
    if (
      (init.method === "POST" || init.method === "PUT" || init.method === "PATCH") &&
      !headers.has("origin")
    ) {
      headers.set("origin", new URL(BASE).origin);
    }
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

async function seedAllowedPractitioner(deps: AppDependencies): Promise<string> {
  seededAllowedPractitionerId = generateOpaqueEntityId();
  await deps.sql.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    [
      seededAllowedPractitionerId,
      FAKE_GOOGLE_ALLOWED_EMAIL,
      "2026-01-01T00:00:00.000Z",
    ],
  );
  return seededAllowedPractitionerId;
}

async function createAuthTestDeps(
  allowedEmails = FAKE_GOOGLE_ALLOWED_EMAIL,
  options: { seedPractitioner?: boolean } = {},
): Promise<AppDependencies> {
  const deps = await createNodeAppDependencies({
    AUTH_BASE_URL: BASE,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: allowedEmails,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
  });
  if (options.seedPractitioner !== false) {
    await seedAllowedPractitioner(deps);
  }
  return deps;
}

function expectZeroBetterAuthRows(storage: BetterSqliteStorage): void {
  const db = storage.nativeDatabase();
  for (const table of ["user", "session", "account", "verification"] as const) {
    const row = db.prepare(`SELECT count(*) as c FROM "${table}"`).get() as {
      c: number;
    };
    expect(row.c, table).toBe(0);
  }
}

async function completeGoogleSignIn(
  deps: AppDependencies,
  fixture: FakeGoogleFixture,
): Promise<{ jar: CookieJar; lastResponse: Response; sessionSetCookies: string[] }> {
  const sessionSetCookies: string[] = [];
  const noteSessionCookie = (response: Response): void => {
    const raw = response.headers.get("set-cookie");
    if (raw?.includes("better-auth.session_token=")) {
      sessionSetCookies.push(raw);
    }
  };
  const jar = new CookieJar();
  const signIn = await requestWithJar(`${BASE}/api/auth/sign-in/social`, deps, jar, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
  });
  noteSessionCookie(signIn);
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
    noteSessionCookie(response);
  }
  return { jar, lastResponse: response, sessionSetCookies };
}

describe("Google sign-in (integration)", () => {
  it("allows the fixture account and sets a session cookie", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    expect(jar.header()).toContain("better-auth.session_token=");
    const practitioner = await deps.auth.getPractitioner(
      new Request(`${BASE}/exercises`, { headers: { cookie: jar.header() } }),
    );
    expect(practitioner?.practitionerId).toBe(seededAllowedPractitionerId);
    validateOpaqueEntityId(practitioner!.practitionerId, "practitionerId");
  });

  it("returns a session practitionerId that passes validateOpaqueEntityId", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    const practitioner = await deps.auth.getPractitioner(
      new Request(`${BASE}/exercises`, { headers: { cookie: jar.header() } }),
    );
    expect(practitioner).not.toBeNull();
    expect(validateOpaqueEntityId(practitioner!.practitionerId, "practitionerId")).toBe(
      practitioner!.practitionerId.toLowerCase(),
    );
  });

  it("uses practitioner displayName from the Better Auth session user name", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    const practitioner = await deps.auth.getPractitioner(
      new Request(`${BASE}/exercises`, { headers: { cookie: jar.header() } }),
    );
    expect(practitioner?.displayName).toBe("Kojo");
  });

  it("refuses the fixture account with the refusal page and writes no auth rows", async () => {
    const deps = await createAuthTestDeps();
    const { lastResponse } = await completeGoogleSignIn(deps, "refused");
    const body = await lastResponse.text();
    expect(body).toContain(AUTH_REFUSAL_MESSAGE);
    expect(body).not.toContain("<title>Sign in</title>");
    const storage = deps.sql;
    if (!(storage instanceof BetterSqliteStorage)) {
      throw new Error("expected BetterSqliteStorage");
    }
    expectZeroBetterAuthRows(storage);
  });

  it("accepts mixed-case and padded allowlist entries", async () => {
    const padded = `  ${FAKE_GOOGLE_ALLOWED_EMAIL.toUpperCase()}  `;
    const deps = await createAuthTestDeps(padded);
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    expect(jar.header()).toContain("better-auth.session_token=");
  });

  it("refuses unverified Google email with the allowlist refusal page and no auth rows", async () => {
    const deps = await createAuthTestDeps();
    const { lastResponse } = await completeGoogleSignIn(deps, "unverified");
    expect(await lastResponse.text()).toContain(AUTH_REFUSAL_MESSAGE);
    const storage = deps.sql;
    if (!(storage instanceof BetterSqliteStorage)) {
      throw new Error("expected BetterSqliteStorage");
    }
    expectZeroBetterAuthRows(storage);
  });

  it("refuses allowlisted email without a practitioner row and writes no auth rows", async () => {
    const deps = await createAuthTestDeps(FAKE_GOOGLE_ALLOWED_EMAIL, {
      seedPractitioner: false,
    });
    const { lastResponse } = await completeGoogleSignIn(deps, "allowed");
    expect(await lastResponse.text()).toContain(AUTH_REFUSAL_MESSAGE);
    const storage = deps.sql;
    if (!(storage instanceof BetterSqliteStorage)) {
      throw new Error("expected BetterSqliteStorage");
    }
    expectZeroBetterAuthRows(storage);
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

  it("sets Better Auth session cookie with HttpOnly, Secure, and SameSite=Lax", async () => {
    const deps = await createAuthTestDeps();
    const { sessionSetCookies } = await completeGoogleSignIn(deps, "allowed");
    expect(sessionSetCookies.length).toBeGreaterThan(0);
    const combined = sessionSetCookies.join("\n");
    expect(combined).toMatch(/better-auth\.session_token=/);
    expect(combined).toContain("HttpOnly");
    expect(combined).toContain("Secure");
    expect(combined).toMatch(/SameSite=Lax\b/);
  });

  it("clears the session cookie on sign out", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    const signedOut = await requestWithJar(`${BASE}/api/auth/sign-out`, deps, jar, {
      method: "POST",
    });
    const setCookies =
      typeof signedOut.headers.getSetCookie === "function"
        ? signedOut.headers.getSetCookie()
        : signedOut.headers.get("set-cookie")
          ? [signedOut.headers.get("set-cookie")!]
          : [];
    expect(setCookies.length).toBeGreaterThan(0);
    const combined = setCookies.join("\n");
    expect(combined.toLowerCase()).toMatch(/max-age=0/);
    expect(combined).toMatch(/SameSite=Lax\b/);
    expect(jar.header()).not.toMatch(/session_token=/);
  });

  it("rejects cross-origin sign-in/social POST when a session cookie is present", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    const response = await requestWithJar(
      `${BASE}/api/auth/sign-in/social`,
      deps,
      jar,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
      },
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects off-site callbackURL on sign-in/social", async () => {
    const deps = await createAuthTestDeps();
    const response = await handleRequest(
      new Request(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "https://evil.example/steal",
        }),
      }),
      deps,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects cross-origin sign-out", async () => {
    const deps = await createAuthTestDeps();
    const { jar } = await completeGoogleSignIn(deps, "allowed");
    const signedOut = await requestWithJar(`${BASE}/api/auth/sign-out`, deps, jar, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(signedOut.status).toBeGreaterThanOrEqual(400);
  });

  it("redirects signed-out deep links through sign-in and preserves returnTo", async () => {
    const deps = await createAuthTestDeps();
    const response = await handleRequest(new Request(`${BASE}/programs`), deps);
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/sign-in");
    expect(location).toContain(encodeURIComponent("/programs"));
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
