import { describe, expect, it } from "vitest";
import worker from "../src/entry/worker.js";

describe("Worker entry (integration)", () => {
  it("fetch GET /health returns 200 without configured bindings", async () => {
    const response = await worker.fetch(
      new Request("https://example.workers.dev/health"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "physio-poc",
    });
  });
});
