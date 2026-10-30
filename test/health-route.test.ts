import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { MCP_TEST_BASE } from "./mcp-server-test-utils.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";

function testDeps() {
  const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET, {
    fakeGoogleProvider: false,
  });
  return {
    sql: new InMemorySqlStorage(),
    objects: new InMemoryObjectStorage(),
    config,
    auth: new FakeAuthPort({ practitioner: null }),
    mcp: createPhysioMcpHttpHandler(config),
  };
}

describe("health route (integration)", () => {
  it("GET /health returns ok JSON with content-type", async () => {
    const response = await handleRequest(
      new Request(`${MCP_TEST_BASE}/health`),
      testDeps(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "physio-poc",
    });
  });

  it("POST /health is not 200", async () => {
    const response = await handleRequest(
      new Request(`${MCP_TEST_BASE}/health`, { method: "POST" }),
      testDeps(),
    );
    expect(response.status).not.toBe(200);
    expect(response.status).toBe(405);
  });

  it("/healthz redirects signed-out visitors to sign-in", async () => {
    const response = await handleRequest(
      new Request(`${MCP_TEST_BASE}/healthz`),
      testDeps(),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/sign-in");
  });

  it("unknown app paths redirect to sign-in when signed out", async () => {
    const response = await handleRequest(
      new Request(`${MCP_TEST_BASE}/unknown`),
      testDeps(),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/sign-in");
  });

  it("GET /health does not read storage ports", async () => {
    const deps = testDeps();
    const sqlRun = vi.spyOn(deps.sql, "run");
    const objectGet = vi.spyOn(deps.objects, "get");
    await handleRequest(new Request(`${MCP_TEST_BASE}/health`), deps);
    expect(sqlRun).not.toHaveBeenCalled();
    expect(objectGet).not.toHaveBeenCalled();
  });

  it("HEAD /health returns 200 with an empty body", async () => {
    const response = await handleRequest(
      new Request(`${MCP_TEST_BASE}/health`, { method: "HEAD" }),
      testDeps(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
  });
});

describe("exercise migration still applies with auth migration present", () => {
  it("loads the exercise migration SQL fixture", () => {
    const sql = readFileSync(
      join(process.cwd(), "migrations/0001_exercise_data_model.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS practitioners");
  });
});
