import { describe, expect, it, vi } from "vitest";
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
  it("GET /health returns ok JSON with content-type", async () => {
    const response = await handleRequest(
      new Request("http://127.0.0.1/health"),
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
      new Request("http://127.0.0.1/health", { method: "POST" }),
      testDeps(),
    );
    expect(response.status).not.toBe(200);
    expect(response.status).toBe(405);
  });

  it("/healthz returns 404 with JSON body and content-type", async () => {
    const response = await handleRequest(
      new Request("http://127.0.0.1/healthz"),
      testDeps(),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("unknown paths return 404 JSON", async () => {
    const response = await handleRequest(
      new Request("http://127.0.0.1/unknown"),
      testDeps(),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("GET /health does not read storage ports", async () => {
    const deps = testDeps();
    const sqlRun = vi.spyOn(deps.sql, "run");
    const objectGet = vi.spyOn(deps.objects, "get");
    await handleRequest(new Request("http://127.0.0.1/health"), deps);
    expect(sqlRun).not.toHaveBeenCalled();
    expect(objectGet).not.toHaveBeenCalled();
  });

  it("HEAD /health returns 200 with an empty body", async () => {
    const response = await handleRequest(
      new Request("http://127.0.0.1/health", { method: "HEAD" }),
      testDeps(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
  });
});
