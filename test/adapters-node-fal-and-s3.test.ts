import { describe, expect, it, vi } from "vitest";
import { createImageGenerationPort } from "../src/adapters/node/create-image-generation-port.js";
import {
  FAL_FLUX_KLEIN_4B_MODEL_ID,
  FAL_IMAGE_DOWNLOAD_MAX_BYTES,
  FAL_STORE_IO_DISABLED,
  FAL_STORE_IO_HEADER,
  FalFluxKleinImageGeneration,
} from "../src/adapters/node/fal-flux-klein-image-generation.js";
import { buildStartImagePrompt } from "../src/domain/exercise-media-prompts.js";
import { S3CompatibleObjectStorage } from "../src/adapters/node/s3-compatible-object-storage.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";

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

  it("does not include the API key or practitioner guidance in thrown errors", async () => {
    const guidance = "show forearm support only";
    const fetchImpl = vi.fn(async () => {
      return new Response(`invalid key ${apiKey} guidance ${guidance}`, {
        status: 401,
      });
    });
    const generator = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    const prompt = buildStartImagePrompt({
      title: "Bridge",
      regenerationNote: guidance,
    });
    await expect(generator.generateEndImage(prompt)).rejects.toSatisfy(
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain(apiKey);
        expect(message).not.toContain(guidance);
        expect(message).toContain("[REDACTED]");
        return true;
      },
    );
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

describe("S3CompatibleObjectStorage (unit, mocked fetch)", () => {
  const secretAccessKey = "s3-secret-must-not-leak";

  it("PUTs to the bucket object URL with SigV4 Authorization", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      capturedMethod = init?.method ?? "GET";
      return new Response(null, { status: 200 });
    });

    const storage = new S3CompatibleObjectStorage({
      endpoint: "https://example.r2.cloudflarestorage.com",
      bucket: "physio-media",
      accessKeyId: "access-id",
      secretAccessKey,
      region: "auto",
      fetchImpl,
    });

    await storage.put("media-sets/ms-1/start.png", new Uint8Array([1, 2]), "image/png");

    expect(capturedMethod).toBe("PUT");
    expect(capturedUrl).toContain("physio-media");
    expect(capturedUrl).toContain("media-sets/ms-1/start.png");
    expect(headerValue(fetchImpl.mock.calls[0]?.[1]?.headers, "Authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=/,
    );
  });

  it("does not include the secret access key in thrown errors", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(`SignatureDoesNotMatch ${secretAccessKey}`, { status: 403 });
    });
    const storage = new S3CompatibleObjectStorage({
      endpoint: "https://example.r2.cloudflarestorage.com",
      bucket: "physio-media",
      accessKeyId: "access-id",
      secretAccessKey,
      fetchImpl,
    });

    await expect(storage.get("missing.png")).rejects.toSatisfy((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(secretAccessKey);
      return true;
    });
  });
});
