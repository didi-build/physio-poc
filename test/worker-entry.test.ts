import { describe, expect, it } from "vitest";
import worker from "../src/entry/worker.js";

describe("Worker entry (integration)", () => {
  const practitionerId = "pract-1";
  const exerciseId = "ex-1";
  const apiBase = `https://example.workers.dev/api/practitioners/${practitionerId}`;

  it("fetch GET /health returns 200 without configured bindings", async () => {
    const response = await worker.fetch(
      new Request("https://example.workers.dev/health"),
      {},
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "physio-poc",
    });
  });

  it("returns 404 for unauthenticated exercise API routes", async () => {
    const cases: { method: string; path: string; body?: string }[] = [
      { method: "GET", path: `${apiBase}/exercises/approved/search` },
      {
        method: "POST",
        path: `${apiBase}/my-exercises/${exerciseId}`,
        body: JSON.stringify({ action: "save" }),
      },
      {
        method: "PATCH",
        path: `${apiBase}/my-exercises/${exerciseId}`,
        body: JSON.stringify({ text_overrides: {} }),
      },
      { method: "DELETE", path: `${apiBase}/my-exercises/${exerciseId}` },
    ];

    for (const testCase of cases) {
      const response = await worker.fetch(
        new Request(testCase.path, {
          method: testCase.method,
          headers: testCase.body ? { "content-type": "application/json" } : undefined,
          body: testCase.body,
        }),
        {},
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "not_found" });
    }
  });
});
