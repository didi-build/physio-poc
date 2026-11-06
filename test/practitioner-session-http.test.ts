import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { PRACTITIONER_SESSION_API_PATH } from "../src/practitioner-session-api-paths.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import {
  expectInvalidInputQueryGuardResponse,
  practitionerIdQuerySuffix,
} from "./helpers/invalid-input-query-guard.js";
import { openMigratedDatabase } from "./helpers/exercise-sqlite-fixture.js";

const BASE = "https://physio.test.example";

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
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      auth,
    };
    const cookie = auth.createSessionCookieHeader();
    const response = await handleRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, {
        headers: { cookie },
      }),
      deps,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      display_name: string;
      practitioner_id: string;
    };
    expect(body.display_name).toBe("Coach Alpha");
    expect(body.practitioner_id).toBe(practitionerId);
    expect(JSON.stringify(body)).not.toContain("@");
  });

  it("returns 401 without a session cookie", async () => {
    const storage = await openMigratedDatabase();
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: testOpaqueEntityId("session-http-b"),
        email: "coach-b@example.com",
        displayName: "Coach Beta",
      },
    });
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      auth,
    };
    const response = await handleRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`),
      deps,
    );
    expect(response.status).toBe(401);
  });

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
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      auth,
    };
    const cookie = auth.createSessionCookieHeader();
    const url = `${BASE}${PRACTITIONER_SESSION_API_PATH}${practitionerIdQuerySuffix(testOpaqueEntityId("other-practitioner"))}`;
    const response = await handleRequest(
      new Request(url, { headers: { cookie } }),
      deps,
    );
    await expectInvalidInputQueryGuardResponse(response);
  });
});
