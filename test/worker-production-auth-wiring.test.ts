import { describe, expect, it } from "vitest";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { handleRequest } from "../src/http/app.js";
import { mcpOAuthResourceUrl } from "../src/auth/mcp-oauth/paths.js";
import {
  createWorkerProductionAuthTestDeps,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import {
  CHATGPT_CIMD_CLIENT_ID,
  mcpRequestHeaders,
  signTestMcpAccessToken,
} from "./helpers/mcp-oauth-test-utils.js";

const BASE = WORKER_PRODUCTION_TEST_BASE;

describe("Worker production auth wiring (AC2, DIDI-1153)", () => {
  it("rejects invalid callbackURL on Worker production deps", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps();
    const response = await handleRequest(
      new Request(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: new URL(BASE).origin },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "https://evil.example/steal",
        }),
      }),
      deps,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CALLBACK_URL",
    });
  });

  it("returns MCP bearer challenge on Worker production deps", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps();
    const response = await handleRequest(
      new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: mcpRequestHeaders(),
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")?.toLowerCase()).toContain("bearer");
  });

  it("accepts a signed MCP bearer token when the Better Auth session is active", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps();
    const userId = generateOpaqueEntityId();
    const sessionId = generateOpaqueEntityId();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    await deps.sql.run(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, "Fixture", "fixture@example.com", 1, now, now],
    );
    await deps.sql.run(
      `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, expiresAt, generateOpaqueEntityId(), now, now, userId],
    );
    const resource = mcpOAuthResourceUrl(BASE);
    const accessToken = await signTestMcpAccessToken(deps, {
      sid: sessionId,
      sub: userId,
      aud: [resource],
      azp: CHATGPT_CIMD_CLIENT_ID,
      iss: `${BASE.replace(/\/$/, "")}/api/auth`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const mcp = await handleRequest(
      new Request(`${BASE}/mcp`, {
        method: "POST",
        headers: mcpRequestHeaders(accessToken),
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          id: 1,
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "0" },
          },
        }),
      }),
      deps,
    );
    expect(mcp.status).toBe(200);
  });
});
