import { describe, expect, it } from "vitest";
import worker from "../src/entry/worker.js";

describe("Worker entry (integration)", () => {
  const practitionerId = "pract-1";
  const exerciseId = "ex-1";
  const requestId = "66666666-6666-4666-8666-666666666666";
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

  it("returns 404 for unauthenticated exercise request API routes", async () => {
    const cases: { method: string; path: string; body?: string }[] = [
      { method: "GET", path: `${apiBase}/exercise-requests/similar?q=heel` },
      { method: "GET", path: `${apiBase}/exercise-requests/in-progress` },
      { method: "GET", path: `${apiBase}/exercise-requests/in-progress/count` },
      {
        method: "POST",
        path: `${apiBase}/exercise-requests`,
        body: JSON.stringify({
          requested_name: "Heel slide",
          form_opened_at: "2026-10-30T10:00:00.000Z",
        }),
      },
      { method: "GET", path: `${apiBase}/exercise-requests/${requestId}` },
      {
        method: "PATCH",
        path: `${apiBase}/exercise-requests/${requestId}/draft`,
        body: JSON.stringify({ title: "Edited" }),
      },
      { method: "POST", path: `${apiBase}/exercise-requests/${requestId}/approve` },
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
