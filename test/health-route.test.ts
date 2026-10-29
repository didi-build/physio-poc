import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";

function testDeps() {
  return {
    sql: new InMemorySqlStorage(),
    objects: new InMemoryObjectStorage(),
  };
}

describe("health route (integration)", () => {
  it("GET /health returns ok JSON", async () => {
    const response = await handleRequest(
      new Request("http://127.0.0.1/health"),
      testDeps(),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "physio-poc",
    });
  });

  it("unknown paths return 404", async () => {
    const response = await handleRequest(
      new Request("http://127.0.0.1/unknown"),
      testDeps(),
    );
    expect(response.status).toBe(404);
  });
});
