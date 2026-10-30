import { describe, expect, it } from "vitest";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { PHYSIO_GOOGLE_OAUTH_SCOPES } from "../src/auth/better-auth-minimal-storage.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { handleRequest } from "../src/http/app.js";
import type { AppDependencies } from "../src/http/app.js";

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

async function completeGoogleSignIn(deps: AppDependencies): Promise<void> {
  const jar = new CookieJar();
  const signIn = await requestWithJar(`${BASE}/api/auth/sign-in/social`, deps, jar, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", callbackURL: "/exercises" }),
  });
  const payload = (await signIn.json()) as { url?: string };
  expect(payload.url).toBeTruthy();
  expect(payload.url).not.toMatch(/access_type=offline/);
  const authorizeUrl = new URL(payload.url ?? "");
  authorizeUrl.searchParams.set("fixture", "allowed");
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
    response = await requestWithJar(new URL(nextUrl, BASE).toString(), deps, jar);
  }
  expect(jar.header()).toContain("better-auth.session_token=");
}

describe("Better Auth minimal storage (integration)", () => {
  it("stores only openid email profile in account.scope after sign-in", async () => {
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: BASE,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: FAKE_GOOGLE_ALLOWED_EMAIL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    });
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      ["pract-kojo", FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );

    await completeGoogleSignIn(deps);

    const storage = deps.sql;
    if (!(storage instanceof BetterSqliteStorage)) {
      throw new Error("expected BetterSqliteStorage");
    }
    const db = storage.nativeDatabase();

    const user = db.prepare('SELECT name, email, image FROM "user" LIMIT 1').get() as
      { name: string | null; email: string; image: unknown } | undefined;
    expect(user?.email).toBe(FAKE_GOOGLE_ALLOWED_EMAIL);
    expect(user?.name).toBeTruthy();
    expect(user?.image).toBeNull();

    const session = db
      .prepare('SELECT ipAddress, userAgent FROM "session" LIMIT 1')
      .get() as { ipAddress: unknown; userAgent: unknown } | undefined;
    expect(session?.ipAddress).toBeNull();
    expect(session?.userAgent).toBeNull();

    const account = db
      .prepare(
        'SELECT scope, accessToken, refreshToken, idToken, password FROM "account" LIMIT 1',
      )
      .get() as
      | {
          scope: string | null;
          accessToken: unknown;
          refreshToken: unknown;
          idToken: unknown;
          password: unknown;
        }
      | undefined;
    expect(account?.scope?.split(/\s+/).sort()).toEqual(
      [...PHYSIO_GOOGLE_OAUTH_SCOPES].sort(),
    );
    expect(account?.accessToken).toBeNull();
    expect(account?.refreshToken).toBeNull();
    expect(account?.idToken).toBeNull();
    expect(account?.password).toBeNull();
  });
});
