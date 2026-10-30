import { describe, expect, it } from "vitest";
import {
  buildPhysioBetterAuthOptions,
  PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS,
} from "../src/adapters/node/create-better-auth.js";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioServerConfig } from "../src/http/config.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import {
  completeGoogleSignIn,
  CookieJar,
  requestWithJar,
} from "./helpers/google-sign-in-flow.js";

const BASE = "http://127.0.0.1:8787";

function sessionTokenSetCookies(responses: Response[]): string[] {
  const cookies: string[] = [];
  for (const response of responses) {
    const parts =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : response.headers.get("set-cookie")
          ? [response.headers.get("set-cookie")!]
          : [];
    for (const raw of parts) {
      if (raw.includes("better-auth.session_token=")) {
        cookies.push(raw);
      }
    }
  }
  return cookies;
}

async function createDeps() {
  const deps = await createNodeAppDependencies({
    AUTH_BASE_URL: BASE,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
  });
  const practId = generateOpaqueEntityId();
  await deps.sql.run(
    "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
    [practId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
  );
  return { deps, practId };
}

describe("Physio Better Auth session expiry (unit)", () => {
  it("pins session.expiresIn on buildPhysioBetterAuthOptions (mutant killer)", () => {
    const storage = BetterSqliteStorage.openInMemory();
    const config = createPhysioServerConfig({
      auth: {
        betterAuthSecret: PHYSIO_TEST_BETTER_AUTH_SECRET,
        googleClientId: "fake",
        googleClientSecret: "fake",
        allowedGoogleEmails: new Set(["allowed@example.com"]),
        fakeGoogleProviderEnabled: true,
        authBaseUrl: BASE,
      },
    }).auth;
    const options = buildPhysioBetterAuthOptions(storage, config);
    expect(options.session?.expiresIn).toBe(
      PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS,
    );
  });

  it("locks the pinned lifetime to seven days in seconds (mutant killer)", () => {
    expect(PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS).toBe(604_800);
    expect(PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS).toBe(60 * 60 * 24 * 7);
  });
});

describe("Physio Better Auth session expiry (integration)", () => {
  it("sets session_token Max-Age and session row expiry from the pinned lifetime", async () => {
    const { deps } = await createDeps();
    const sessionSetCookies: string[] = [];
    const jar = new CookieJar();
    const signIn = await requestWithJar(
      BASE,
      `${BASE}/api/auth/sign-in/social`,
      deps,
      jar,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
      },
    );
    sessionSetCookies.push(...sessionTokenSetCookies([signIn]));
    const payload = (await signIn.json()) as { url?: string };
    expect(payload.url).toBeTruthy();
    const authorizeUrl = new URL(payload.url ?? "");
    authorizeUrl.searchParams.set("fixture", "allowed");
    let response = await requestWithJar(BASE, authorizeUrl.toString(), deps, jar);
    for (
      let step = 0;
      step < 8 && response.status >= 300 && response.status < 400;
      step += 1
    ) {
      sessionSetCookies.push(...sessionTokenSetCookies([response]));
      const nextUrl = response.headers.get("location");
      if (!nextUrl) {
        break;
      }
      response = await requestWithJar(
        BASE,
        new URL(nextUrl, BASE).toString(),
        deps,
        jar,
      );
    }
    sessionSetCookies.push(...sessionTokenSetCookies([response]));
    expect(jar.header()).toContain("better-auth.session_token=");

    expect(sessionSetCookies.length).toBeGreaterThan(0);
    const combined = sessionSetCookies.join("\n");
    expect(combined).toMatch(
      new RegExp(`Max-Age=${PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS}\\b`),
    );

    const row = await deps.sql.first<{ expiresAt: string; createdAt: string }>(
      'SELECT "expiresAt", "createdAt" FROM "session" LIMIT 1',
    );
    expect(row).toBeTruthy();
    const deltaSeconds = Math.round(
      (Date.parse(row!.expiresAt) - Date.parse(row!.createdAt)) / 1000,
    );
    expect(deltaSeconds).toBe(PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS);
  });

  it("treats an expired session as signed out", async () => {
    const { deps, practId } = await createDeps();
    const { jar } = await completeGoogleSignIn(BASE, deps, "allowed");
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    await deps.sql.run('UPDATE "session" SET "expiresAt" = ?', [expiredAt]);

    const cookieHeader = jar.header();
    const api = await requestWithJar(
      BASE,
      `${BASE}/api/practitioners/${practId}/my-exercises`,
      deps,
      jar,
      { headers: { cookie: cookieHeader } },
    );
    expect(api.status).toBe(401);

    const programs = await handleRequest(
      new Request(`${BASE}/programs`, { headers: { cookie: cookieHeader } }),
      deps,
    );
    expect(programs.status).toBe(302);
    expect(programs.headers.get("location") ?? "").toContain("/sign-in");
  });
});
