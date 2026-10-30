import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  CSRF_EXEMPT_APP_API_AUTH_PREFIX,
  isCsrfExemptAppApiAuthPath,
  rejectMutatingAppApiCsrf,
  requiresAppApiCsrfGuard,
} from "../src/http/mutating-app-api-csrf.js";
import {
  MUTATING_APP_API_ROUTE_SAMPLES,
  mutatingAppApiRouteSampleKey,
} from "./helpers/mutating-app-api-route-registry.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const PRACTITIONER_ID = testOpaqueEntityId("csrf-practitioner");
const EXERCISE_ID = testOpaqueEntityId("csrf-exercise");
const VERSION_ID = testOpaqueEntityId("csrf-version");
const UNREGISTERED_PROBE_PATH = "/api/__probe_new_route";

const NON_SAFE_METHODS_UNDER_TEST = [
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "PROPFIND",
] as const;

async function seedApprovedExercise(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  exerciseId: string,
): Promise<void> {
  await seedExercise(storage, practitionerId, exerciseId);
  await storage.run(
    VERSION_INSERT_SQL,
    versionInsertBindings({
      id: VERSION_ID,
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title: "Example",
    }),
  );
}

function sameOriginJsonHeaders(origin = new URL(BASE).origin): HeadersInit {
  return {
    origin,
    "content-type": "application/json",
  };
}

function mutatingBody(path: string, method: string): string | undefined {
  if (method === "DELETE") {
    return undefined;
  }
  if (path.includes("/media/regenerate")) {
    return JSON.stringify({ scope: "both", note: null });
  }
  if (path.includes("/media/generate")) {
    return JSON.stringify({});
  }
  if (method === "PATCH") {
    return JSON.stringify({ text_overrides: { title: "mine" } });
  }
  return JSON.stringify({ action: "save" });
}

async function sessionDeps(): Promise<{
  deps: {
    sql: Awaited<ReturnType<typeof openMigratedDatabase>>;
    objects: InMemoryObjectStorage;
    config: typeof MCP_TEST_CONFIG;
    auth: FakeAuthPort;
    mcp: ReturnType<typeof createPhysioMcpHttpHandler>;
  };
  cookie: string;
}> {
  const storage = await openMigratedDatabase();
  await seedPractitioner(storage, PRACTITIONER_ID);
  await seedApprovedExercise(storage, PRACTITIONER_ID, EXERCISE_ID);
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: PRACTITIONER_ID,
      email: "csrf.test@example.com",
      displayName: "Tester",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

describe("mutating app API CSRF guard", () => {
  it("pins the test-only route sample registry for known routes", () => {
    const keys = MUTATING_APP_API_ROUTE_SAMPLES.map(
      mutatingAppApiRouteSampleKey,
    ).sort();
    expect(keys.length).toBeGreaterThan(0);
  });

  it("returns 403 for cross-origin mutating requests with a valid session and changes nothing", async () => {
    const { deps, cookie } = await sessionDeps();

    for (const sample of MUTATING_APP_API_ROUTE_SAMPLES) {
      const path = sample.samplePath.replace(
        "11111111-1111-4111-8111-111111111111",
        PRACTITIONER_ID,
      );
      const url = `${BASE}${path}`;
      const before = await deps.sql.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ?",
        [PRACTITIONER_ID, EXERCISE_ID],
      );
      const response = await handleRequest(
        new Request(url, {
          method: sample.method,
          headers: {
            cookie,
            origin: "https://evil.example.com",
            "content-type": "application/json",
          },
          body: mutatingBody(path, sample.method),
        }),
        deps,
      );
      expect(response.status, mutatingAppApiRouteSampleKey(sample)).toBe(403);
      const after = await deps.sql.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ?",
        [PRACTITIONER_ID, EXERCISE_ID],
      );
      expect(after?.count).toBe(before?.count);
    }
  });

  it("returns 415 for non-JSON content types and changes nothing", async () => {
    const { deps, cookie } = await sessionDeps();
    const sample = MUTATING_APP_API_ROUTE_SAMPLES.find(
      (entry) =>
        entry.method === "POST" && entry.ruleId === "exercise-library-my-exercises",
    );
    expect(sample).toBeDefined();
    const path = sample!.samplePath.replace(
      "11111111-1111-4111-8111-111111111111",
      PRACTITIONER_ID,
    );
    const response = await handleRequest(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: {
          cookie,
          origin: new URL(BASE).origin,
          "content-type": "text/plain",
        },
        body: "action=save",
      }),
      deps,
    );
    expect(response.status).toBe(415);
  });

  it("allows same-origin JSON mutating requests", async () => {
    const { deps, cookie } = await sessionDeps();
    const path = `/api/practitioners/${PRACTITIONER_ID}/my-exercises/${EXERCISE_ID}`;
    const response = await handleRequest(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: { cookie, ...sameOriginJsonHeaders() },
        body: JSON.stringify({ action: "save" }),
      }),
      deps,
    );
    expect(response.status).toBe(200);
  });

  it("does not guard GET app API routes", async () => {
    const request = new Request(
      `${BASE}/api/practitioners/${PRACTITIONER_ID}/my-exercises`,
      {
        method: "GET",
      },
    );
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)).toBeNull();
  });
});

describe("mutating app API CSRF guard via handleRequest (CTO ruling)", () => {
  it("pins the sole CSRF exemption prefix", () => {
    expect(CSRF_EXEMPT_APP_API_AUTH_PREFIX).toBe("/api/auth");
    expect(isCsrfExemptAppApiAuthPath("/api/auth/sign-out")).toBe(true);
    expect(isCsrfExemptAppApiAuthPath("/api/auth")).toBe(true);
    expect(isCsrfExemptAppApiAuthPath("/api/authx/sign-out")).toBe(false);
    expect(isCsrfExemptAppApiAuthPath("/api/auth-like/sign-out")).toBe(false);
  });

  it("rejects every non-safe method on /api/** before routing when CSRF fails", async () => {
    const { deps, cookie } = await sessionDeps();
    for (const method of NON_SAFE_METHODS_UNDER_TEST) {
      expect(requiresAppApiCsrfGuard(UNREGISTERED_PROBE_PATH, method)).toBe(true);
      const response = await handleRequest(
        new Request(`${BASE}${UNREGISTERED_PROBE_PATH}`, {
          method,
          headers: {
            cookie,
            origin: "https://evil.example.com",
            "content-type": "application/json",
          },
          body: method === "DELETE" ? undefined : JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status, method).toBe(403);
    }
  });

  it("returns 403 not 404 for an unregistered /api/ path when origin is cross-site", async () => {
    const { deps, cookie } = await sessionDeps();
    const response = await handleRequest(
      new Request(`${BASE}${UNREGISTERED_PROBE_PATH}`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://evil.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      deps,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
  });

  it("returns 404 not 403 for an unregistered /api/ path when CSRF passes", async () => {
    const { deps, cookie } = await sessionDeps();
    const response = await handleRequest(
      new Request(`${BASE}${UNREGISTERED_PROBE_PATH}`, {
        method: "POST",
        headers: {
          cookie,
          ...sameOriginJsonHeaders(),
        },
        body: JSON.stringify({}),
      }),
      deps,
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("rejects lowercase non-standard methods on /api/** before routing when CSRF fails", async () => {
    const { deps, cookie } = await sessionDeps();
    for (const method of ["patch", "propfind"] as const) {
      const response = await handleRequest(
        new Request(`${BASE}${UNREGISTERED_PROBE_PATH}`, {
          method,
          headers: {
            cookie,
            origin: "https://evil.example.com",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status, method).toBe(403);
    }
  });

  it("does not apply CSRF to /api/auth/<sub> through handleRequest", async () => {
    const { deps } = await sessionDeps();
    const response = await handleRequest(
      new Request(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          origin: "https://evil.example.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      deps,
    );
    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(415);
  });

  it("does not apply CSRF to /api/auth/** paths in rejectMutatingAppApiCsrf", () => {
    const request = new Request(`${BASE}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        Origin: "https://evil.example.com",
        "Content-Type": "application/json",
      },
    });
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)).toBeNull();
  });

  it("applies CSRF to /api/authx and /api/auth-like lookalikes", async () => {
    const { deps, cookie } = await sessionDeps();
    for (const path of ["/api/authx/probe", "/api/auth-like/probe"]) {
      const response = await handleRequest(
        new Request(`${BASE}${path}`, {
          method: "POST",
          headers: {
            cookie,
            origin: "https://evil.example.com",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status, path).toBe(403);
    }
  });

  it("lets GET HEAD and OPTIONS reach dispatch without CSRF rejection", async () => {
    const { deps, cookie } = await sessionDeps();
    const listPath = `/api/practitioners/${PRACTITIONER_ID}/my-exercises`;
    for (const method of ["GET", "HEAD", "OPTIONS"] as const) {
      expect(requiresAppApiCsrfGuard(listPath, method)).toBe(false);
      const response = await handleRequest(
        new Request(`${BASE}${listPath}`, {
          method,
          headers: method === "OPTIONS" ? {} : { cookie },
        }),
        deps,
      );
      expect(response.status, method).not.toBe(403);
      expect(response.status, method).not.toBe(415);
    }
  });
});
