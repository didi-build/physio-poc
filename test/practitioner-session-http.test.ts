import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { PRACTITIONER_SESSION_API_PATH } from "../src/practitioner-session-api-paths.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import {
  expectInvalidInputQueryGuardResponse,
  practitionerIdQuerySuffix,
} from "./helpers/invalid-input-query-guard.js";
import { openMigratedDatabase } from "./helpers/exercise-sqlite-fixture.js";

const BASE = "https://physio.test.example";

function sessionDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  auth: FakeAuthPort,
) {
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    auth,
  };
}

describe("GET /api/me/session", () => {
  it("returns display_name and practitioner_id for the signed-in session", async () => {
    const storage = await openMigratedDatabase();
    const practitionerId = testOpaqueEntityId("session-http-a");
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId,
        email: "coach-a@example.com",
        displayName: "Coach Alpha",
      },
    });
    const deps = sessionDeps(storage, auth);
    const cookie = auth.createSessionCookieHeader();
    const response = await handleRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, {
        headers: { cookie },
      }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["display_name", "practitioner_id"]);
    expect(body.display_name).toBe("Coach Alpha");
    expect(body.practitioner_id).toBe(practitionerId);
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("returns each practitioner only their own identity for distinct session cookies", async () => {
    const storage = await openMigratedDatabase();
    const idA = testOpaqueEntityId("session-http-pract-a");
    const idB = testOpaqueEntityId("session-http-pract-b");
    const authA = new FakeAuthPort({
      practitioner: {
        practitionerId: idA,
        email: "alpha@example.com",
        displayName: "Alpha Coach",
      },
      sessionCookieName: "physio.fake_session_a",
    });
    const authB = new FakeAuthPort({
      practitioner: {
        practitionerId: idB,
        email: "beta@example.com",
        displayName: "Beta Coach",
      },
      sessionCookieName: "physio.fake_session_b",
    });
    const responseA = await handleRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, {
        headers: { cookie: authA.createSessionCookieHeader() },
      }),
      sessionDeps(storage, authA),
    );
    const responseB = await handleRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, {
        headers: { cookie: authB.createSessionCookieHeader() },
      }),
      sessionDeps(storage, authB),
    );
    const bodyA = (await responseA.json()) as {
      display_name: string;
      practitioner_id: string;
    };
    const bodyB = (await responseB.json()) as {
      display_name: string;
      practitioner_id: string;
    };
    expect(bodyA).toEqual({ display_name: "Alpha Coach", practitioner_id: idA });
    expect(bodyB).toEqual({ display_name: "Beta Coach", practitioner_id: idB });
  });

  it("returns 401 without a session cookie and sets Cache-Control no-store", async () => {
    const storage = await openMigratedDatabase();
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: testOpaqueEntityId("session-http-b"),
        email: "coach-b@example.com",
        displayName: "Coach Beta",
      },
    });
    const response = await handleRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`),
      sessionDeps(storage, auth),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("display_name");
    expect(body).not.toHaveProperty("practitioner_id");
  });

  it.each(["POST", "PUT", "DELETE"] as const)(
    "returns 405 for %s with Cache-Control no-store and no identity in the body",
    async (method) => {
      const storage = await openMigratedDatabase();
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: testOpaqueEntityId(`session-http-${method}`),
          email: "coach-m@example.com",
          displayName: "Coach Method",
        },
      });
      const response = await handleRequest(
        new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, {
          method,
          headers: { cookie: auth.createSessionCookieHeader() },
        }),
        sessionDeps(storage, auth),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toEqual({ error: "method_not_allowed" });
      expect(body).not.toHaveProperty("display_name");
      expect(body).not.toHaveProperty("practitioner_id");
    },
  );

  it("rejects practitionerId query params with the same invalid_input guard as other /api/me routes", async () => {
    const storage = await openMigratedDatabase();
    const practitionerId = testOpaqueEntityId("session-http-query");
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId,
        email: "coach-query@example.com",
        displayName: "Coach Query",
      },
    });
    const cookie = auth.createSessionCookieHeader();
    const url = `${BASE}${PRACTITIONER_SESSION_API_PATH}${practitionerIdQuerySuffix(testOpaqueEntityId("other-practitioner"))}`;
    const response = await handleRequest(
      new Request(url, { headers: { cookie } }),
      sessionDeps(storage, auth),
    );
    await expectInvalidInputQueryGuardResponse(response);
  });
});
