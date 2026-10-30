import { describe, expect, it } from "vitest";
import worker from "../src/entry/worker.js";
import { exerciseMediaHttpRouteCases } from "../src/http/routes/exercise-media.js";

describe("Worker entry (integration)", () => {
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

  it("returns 401 for exercise media API routes without a session on the Worker entry", async () => {
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
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    }
  });
});
