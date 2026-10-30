import { describe, expect, it } from "vitest";
import worker from "../src/entry/worker.js";
import { exerciseMediaHttpRouteCases } from "../src/http/routes/exercise-media.js";

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

  it("returns 404 for unauthenticated exercise library API routes", async () => {
    const cases: { method: string; path: string; body?: string }[] = [
      { method: "GET", path: `${apiBase}/exercises/approved/search` },
      { method: "GET", path: `${apiBase}/exercises/${exerciseId}` },
      { method: "GET", path: `${apiBase}/my-exercises` },
      {
        method: "POST",
        path: `${apiBase}/my-exercises/${exerciseId}`,
        body: JSON.stringify({ action: "save" }),
      },
      {
        method: "POST",
        path: `${apiBase}/my-exercises/${exerciseId}`,
        body: JSON.stringify({ action: "pin", pinned: true }),
      },
      {
        method: "POST",
        path: `${apiBase}/my-exercises/${exerciseId}`,
        body: JSON.stringify({
          action: "undo",
          undo: {
            practitioner_id: practitionerId,
            exercise_id: exerciseId,
            snapshot: {
              had_row: false,
              favourite: false,
              saved_at: null,
              last_used_at: null,
              text_overrides_json: "{}",
              param_overrides_json: "{}",
            },
          },
        }),
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

  it("returns 404 for exercise media API routes", async () => {
    for (const testCase of exerciseMediaHttpRouteCases()) {
      const response = await worker.fetch(
        new Request(`https://example.workers.dev${testCase.path}`, {
          method: testCase.method,
          headers:
            testCase.method === "POST"
              ? { "content-type": "application/json" }
              : undefined,
          body:
            testCase.method === "POST" ? JSON.stringify({ scope: "start" }) : undefined,
        }),
        {},
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "not_found" });
    }
  });
});
