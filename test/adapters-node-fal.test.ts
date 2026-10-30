import { describe, expect, it, vi } from "vitest";
import { createImageGenerationPort } from "../src/adapters/node/create-image-generation-port.js";
import {
  assertAllowedFalImageDownloadUrl,
  FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID,
  FAL_FLUX_KLEIN_4B_MODEL_ID,
  FAL_IMAGE_DOWNLOAD_MAX_BYTES,
  FAL_STORE_IO_DISABLED,
  FAL_STORE_IO_HEADER,
  FalFluxKleinImageGeneration,
  isAllowedFalImageDownloadHost,
} from "../src/adapters/node/fal-flux-klein-image-generation.js";
import { buildStartImagePrompt } from "../src/domain/exercise-media-prompts.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  expectConsoleCallsLeakFree,
  restoreConsoleSpies,
  spyAllConsoleLevels,
} from "./helpers/console-log-leak-assertions.js";

function headerValue(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    const match = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return match?.[1];
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return value;
    }
  }
  return undefined;
}

describe("FalFluxKleinImageGeneration (unit, mocked fetch)", () => {
  const apiKey = "fal-test-key-must-not-appear-in-errors";
  const allowedImageUrl = "https://v3b.fal.media/files/test/out.png";
  const startImageUrl = "https://v3b.fal.media/files/test/start.png";

  it("POSTs to fal.run with Authorization and X-Fal-Store-IO: 0; download has X-Fal-Store-IO only", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      seen.push({ url, init });
      if (url.includes("fal.run")) {
        expect(headerValue(init?.headers, FAL_STORE_IO_HEADER)).toBe(
          FAL_STORE_IO_DISABLED,
        );
        expect(headerValue(init?.headers, "Authorization")).toMatch(/^Key /);
        return new Response(JSON.stringify({ images: [{ url: allowedImageUrl }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(headerValue(init?.headers, FAL_STORE_IO_HEADER)).toBe(
        FAL_STORE_IO_DISABLED,
      );
      expect(headerValue(init?.headers, "Authorization")).toBeUndefined();
      expect(init?.redirect).toBe("manual");
      return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });

    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    const image = await generator.generateStartImage("test prompt");

    expect(image.contentType).toBe("image/png");
    expect(seen[0]?.url).toBe(`https://fal.run/${FAL_FLUX_KLEIN_4B_MODEL_ID}`);
    expect(seen[0]?.init?.method).toBe("POST");
    expect(seen[1]?.url).toBe(allowedImageUrl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("generates end image via klein edit from the start image URL", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      seen.push(url);
      if (url.endsWith(`/${FAL_FLUX_KLEIN_4B_MODEL_ID}`)) {
        return new Response(JSON.stringify({ images: [{ url: startImageUrl }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith(`/${FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID}`)) {
        const body = JSON.parse(String(init?.body)) as { image_urls?: string[] };
        expect(body.image_urls).toEqual([startImageUrl]);
        return new Response(JSON.stringify({ images: [{ url: allowedImageUrl }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });

    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    await generator.generateStartAndEndImages({
      startPrompt: "start",
      endPrompt: "end",
    });

    expect(
      seen.some((url) => url.endsWith(`/${FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID}`)),
    ).toBe(true);
  });

  it("refuses a non-fal image URL from the API without a download fetch", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("fal.run")) {
        return new Response(
          JSON.stringify({ images: [{ url: "https://cdn.example/out.png" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error("download fetch must not run");
    });
    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("test")).rejects.toThrow(
      "fal image download URL host is not allowed",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses plain http image URLs", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("fal.run")) {
        return new Response(
          JSON.stringify({
            images: [{ url: "http://v3b.fal.media/files/test/out.png" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error("download fetch must not run");
    });
    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("test")).rejects.toThrow(
      "fal image download URL must use https",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses download URLs with userinfo", () => {
    const url = new URL("https://v3b.fal.media/files/test/out.png");
    url.username = "user";
    url.password = "pass";
    expect(() => assertAllowedFalImageDownloadUrl(url.toString())).toThrow(
      "fal image download URL must not include userinfo",
    );
  });

  it("refuses download URLs with a non-default port", () => {
    expect(() =>
      assertAllowedFalImageDownloadUrl("https://v3b.fal.media:8443/files/test/out.png"),
    ).toThrow("fal image download URL must use the default https port");
  });

  it("refuses an off-host redirect without following it", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("fal.run")) {
        return new Response(JSON.stringify({ images: [{ url: allowedImageUrl }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(init?.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/steal.png" },
      });
    });
    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("test")).rejects.toThrow(
      "fal image download URL host is not allowed",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses a response over the download size cap", async () => {
    const overCap = FAL_IMAGE_DOWNLOAD_MAX_BYTES + 1;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("fal.run")) {
        return new Response(JSON.stringify({ images: [{ url: allowedImageUrl }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(init?.redirect).toBe("manual");
      return new Response(new Uint8Array(overCap), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(overCap),
        },
      });
    });
    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("test")).rejects.toThrow(
      "fal image download exceeds size limit",
    );
  });

  it("does not include fal response bodies, API keys, or regeneration notes in thrown errors", async () => {
    const cases = [
      { label: "double quote", note: 'Adjust "knee out"' },
      { label: "newline", note: "line one\nline two" },
    ] as const;

    for (const { note } of cases) {
      const jsonBody = JSON.stringify({ detail: note, echo: note });
      const fetchImpl = vi.fn(async () => {
        return new Response(jsonBody, { status: 401 });
      });
      const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
      const prompt = buildStartImagePrompt({
        title: "Bridge",
        regenerationNote: note,
      });
      const consoleSpies = spyAllConsoleLevels();
      try {
        await expect(
          generator.generateStartImage(prompt, { regenerationNote: note }),
        ).rejects.toMatchObject({
          code: "fal_api_request_failed",
          message: "fal_api_request_failed",
          statusCode: 401,
        });
        expectConsoleCallsLeakFree(consoleSpies, { note, jsonBody, apiKey });
      } finally {
        restoreConsoleSpies(consoleSpies);
      }
    }
  });

  it("does not include regeneration notes when fal returns JSON-escaped echo bodies", async () => {
    const note = 'cue "deep"';
    const jsonBody = '{"error":"cue \\"deep\\""}';
    const fetchImpl = vi.fn(async () => new Response(jsonBody, { status: 403 }));
    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateStartImage("prompt", { regenerationNote: note }),
    ).rejects.toSatisfy((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toBe("fal_api_request_failed");
      expect(message).not.toContain("deep");
      expect(message).not.toContain('\\"');
      expect(message).not.toContain(jsonBody);
      return true;
    });
  });
});

describe("createImageGenerationPort (unit)", () => {
  it("returns FakeImageGeneration when FAL_KEY is missing or blank", () => {
    expect(createImageGenerationPort({})).toBeInstanceOf(FakeImageGeneration);
    expect(createImageGenerationPort({ FAL_KEY: "" })).toBeInstanceOf(
      FakeImageGeneration,
    );
    expect(createImageGenerationPort({ FAL_KEY: "   " })).toBeInstanceOf(
      FakeImageGeneration,
    );
  });

  it("returns FalFluxKleinImageGeneration when FAL_KEY is set", () => {
    const port = createImageGenerationPort({ FAL_KEY: "present-key" });
    expect(port).toBeInstanceOf(FalFluxKleinImageGeneration);
  });
});

describe("fal download allowlist (unit)", () => {
  it("allows apex fal.media and subdomains but rejects lookalike hosts", () => {
    expect(isAllowedFalImageDownloadHost("fal.media")).toBe(true);
    expect(isAllowedFalImageDownloadHost("v3b.fal.media")).toBe(true);
    expect(isAllowedFalImageDownloadHost("evilfal.media")).toBe(false);
  });
});
