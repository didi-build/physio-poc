import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { normalizeReturnTo } from "../src/auth/return-to.js";
import { handleRequest } from "../src/http/app.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { openMigratedDatabase } from "./helpers/exercise-sqlite-fixture.js";

const BASE = "https://physio.test.example";

describe("normalizeReturnTo", () => {
  it("keeps same-origin relative paths", () => {
    expect(normalizeReturnTo("/programs")).toBe("/programs");
    expect(normalizeReturnTo("/exercises?sort=newest")).toBe("/exercises?sort=newest");
  });

  it("rejects off-site and protocol-relative targets", () => {
    expect(normalizeReturnTo("//evil.example")).toBe("/");
    expect(normalizeReturnTo("https://evil.example/x")).toBe("/");
  });

  it("rejects backslash open redirects", () => {
    expect(normalizeReturnTo("/\\evil.example")).toBe("/");
    expect(normalizeReturnTo("/programs\\@evil.example")).toBe("/");
  });

  it("rejects tab characters in the path", () => {
    expect(normalizeReturnTo("/\t/evil.example")).toBe("/");
  });

  it("rejects protocol-relative paths starting with //", () => {
    expect(normalizeReturnTo("//evil.example")).toBe("/");
  });

  it("rejects paths starting with /\\", () => {
    expect(normalizeReturnTo("/\\evil.example")).toBe("/");
  });

  it("rejects paths containing a scheme", () => {
    expect(normalizeReturnTo("/programs://evil")).toBe("/");
  });

  it("rejects javascript scheme targets", () => {
    expect(normalizeReturnTo("javascript:alert(1)")).toBe("/");
  });

  it("rejects bare relative paths without a leading slash", () => {
    expect(normalizeReturnTo("evil.example/x")).toBe("/");
  });
});

describe("guarded app POST without session", () => {
  it("returns 401", async () => {
    const storage = await openMigratedDatabase();
    try {
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth: new FakeAuthPort({ practitioner: null }),
        mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      };
      const response = await handleRequest(
        new Request(`${BASE}/programs`, { method: "POST" }),
        deps,
      );
      expect(response.status).toBe(401);
    } finally {
      storage.close();
    }
  });
});
