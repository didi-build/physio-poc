import { describe, expect, it } from "vitest";
import { FalFluxKleinImageGeneration } from "../src/adapters/node/fal-flux-klein-image-generation.js";

describe("Fal global fetch binding (B1)", () => {
  it("calls upstream through globalThis-bound fetch when fetchImpl is omitted", async () => {
    const apiKey = "fal-test-key-must-not-appear-in-errors";
    const original = globalThis.fetch;
    let calls = 0;
    function strictGlobalFetch(
      this: unknown,
      input: RequestInfo | URL,
    ): Promise<Response> {
      if (this !== globalThis && this !== undefined) {
        throw new TypeError("Illegal invocation");
      }
      calls += 1;
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("fal.media")) {
        return Promise.resolve(
          new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            images: [{ url: "https://v3b.fal.media/files/test/start.png" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    globalThis.fetch = strictGlobalFetch as typeof fetch;
    try {
      const generator = new FalFluxKleinImageGeneration({ apiKey });
      await generator.generateStartImage("prompt");
      expect(calls).toBeGreaterThanOrEqual(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
