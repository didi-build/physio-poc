import { describe, expect, it } from "vitest";
import { FAKE_GOOGLE_ALLOWED_EMAIL } from "../src/auth/fake-google-http.js";
import { handleRequest } from "../src/http/app.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import {
  completeGoogleSignIn,
  countAuthSessions,
  requestWithJar,
  CookieJar,
} from "./helpers/google-sign-in-flow.js";

const BASE = "http://127.0.0.1:8787";

async function createDeps(allowedEmails = FAKE_GOOGLE_ALLOWED_EMAIL) {
  const deps = await createNodeAppDependencies({
    AUTH_BASE_URL: BASE,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: allowedEmails,
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

async function expectSessionInvalidated(
  deps: Awaited<ReturnType<typeof createDeps>>["deps"],
  jar: CookieJar,
  practId: string,
): Promise<void> {
  const cookieHeader = jar.header();
  const api = await requestWithJar(
    BASE,
    `${BASE}/api/practitioners/${practId}/my-exercises`,
    deps,
    jar,
    { headers: { cookie: cookieHeader } },
  );
  expect(api.status).toBe(401);

  const mcp = await handleRequest(
    new Request(`${BASE}/mcp`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    }),
    deps,
  );
  expect(mcp.status).toBe(401);

  const programs = await handleRequest(
    new Request(`${BASE}/programs`, { headers: { cookie: cookieHeader } }),
    deps,
  );
  expect(programs.status).toBe(302);
  expect(programs.headers.get("location") ?? "").toContain("/sign-in");

  expect(await countAuthSessions(deps)).toBe(0);
}

describe("Auth session survival (integration)", () => {
  it("invalidates the session when the allowlist entry is removed mid-session", async () => {
    const { deps, practId } = await createDeps();
    const { jar } = await completeGoogleSignIn(BASE, deps, "allowed");
    expect(await countAuthSessions(deps)).toBe(1);

    const allowlist = deps.config.auth.allowedGoogleEmails as Set<string>;
    allowlist.delete(FAKE_GOOGLE_ALLOWED_EMAIL.toLowerCase());

    await expectSessionInvalidated(deps, jar, practId);
  });

  it("invalidates the session when the practitioner row is deleted", async () => {
    const { deps, practId } = await createDeps();
    const { jar } = await completeGoogleSignIn(BASE, deps, "allowed");
    expect(await countAuthSessions(deps)).toBe(1);

    await deps.sql.run("DELETE FROM practitioners WHERE id = ?", [practId]);

    await expectSessionInvalidated(deps, jar, practId);
  });

  it("invalidates the session when the practitioner is recreated with the same email", async () => {
    const { deps, practId } = await createDeps();
    const { jar } = await completeGoogleSignIn(BASE, deps, "allowed");
    expect(await countAuthSessions(deps)).toBe(1);

    await deps.sql.run("DELETE FROM practitioners WHERE id = ?", [practId]);
    const replacementId = generateOpaqueEntityId();
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [replacementId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );

    await expectSessionInvalidated(deps, jar, practId);
  });

  it("allows a new sign-in after practitioner recreate and binds the new practitioner id", async () => {
    const { deps, practId } = await createDeps();
    const { jar } = await completeGoogleSignIn(BASE, deps, "allowed");
    await deps.sql.run("DELETE FROM practitioners WHERE id = ?", [practId]);
    const replacementId = generateOpaqueEntityId();
    await deps.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [replacementId, FAKE_GOOGLE_ALLOWED_EMAIL, "2026-01-01T00:00:00.000Z"],
    );
    await expectSessionInvalidated(deps, jar, practId);

    const { jar: freshJar } = await completeGoogleSignIn(BASE, deps, "allowed");
    expect(freshJar.header()).toContain("better-auth.session_token=");
    const practitioner = await deps.auth.getPractitioner(
      new Request(`${BASE}/exercises`, { headers: { cookie: freshJar.header() } }),
    );
    expect(practitioner?.practitionerId).toBe(replacementId);
  });
});
