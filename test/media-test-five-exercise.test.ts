import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  FAL_EDIT_URL,
  FAL_STORE_IO_HEADER,
  FAL_STORE_IO_VALUE,
  IMAGE_SIZE_1MP,
  MAX_GENERATIONS_PER_RUN,
} from "../scripts/media-test/constants.js";
import {
  assertAllowedFalImageDownloadUrl,
  downloadFalImageBytes,
} from "../scripts/media-test/download-fal-image.js";
import { buildExerciseImagePrompt } from "../scripts/media-test/prompts.js";
import {
  redactAuthorizationHeader,
  redactFalKey,
} from "../scripts/media-test/redact.js";
import {
  buildFalHeaders,
  callFalKleinEndpoint,
  createGenerationCounter,
  GenerationCapError,
  runFiveExerciseMediaTest,
  safeLogMessage,
} from "../scripts/media-test/run-five-exercise-test.js";

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

describe("media-test prompts (unit)", () => {
  it("builds ADR bridge start prompt", () => {
    expect(buildExerciseImagePrompt("bridge", "start")).toBe(
      "Clinical physiotherapy exercise demonstration: bridge. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.",
    );
  });

  it("swaps pose clause for end images", () => {
    const end = buildExerciseImagePrompt("sit to stand", "end");
    expect(end).toContain("sit to stand");
    expect(end).toContain("Hold the end position of the exercise");
    expect(end).not.toContain("starting position");
  });
});

describe("media-test generation cap (unit)", () => {
  it("pins MAX_GENERATIONS_PER_RUN at 20", () => {
    expect(MAX_GENERATIONS_PER_RUN).toBe(20);
  });

  it("throws after cap ticks without exceeding cap count", () => {
    const counter = createGenerationCounter(3);
    counter.tick();
    counter.tick();
    counter.tick();
    expect(counter.count).toBe(3);
    expect(() => counter.tick()).toThrow(GenerationCapError);
    expect(counter.count).toBe(3);
  });
});

describe("media-test fal headers (unit)", () => {
  it('sets X-Fal-Store-IO to literal "0" and Authorization Key', () => {
    const headers = buildFalHeaders("test-key-example-12345");
    expect(headers[FAL_STORE_IO_HEADER]).toBe("0");
    expect(headers[FAL_STORE_IO_HEADER]).toBe(FAL_STORE_IO_VALUE);
    expect(headers.Authorization).toBe("Key test-key-example-12345");
  });
});

describe("media-test key redaction (unit)", () => {
  const fakeKey = "fal-test-secret-key-abcdef";

  it("redacts the key from plain text", () => {
    expect(redactFalKey(`Bearer ${fakeKey}`, fakeKey)).not.toContain(fakeKey);
    expect(redactFalKey(`Bearer ${fakeKey}`, fakeKey)).toContain("[REDACTED_FAL_KEY]");
  });

  it("redacts Authorization headers in error snippets", () => {
    const scrubbed = redactAuthorizationHeader(`failed: Authorization: Key ${fakeKey}`);
    expect(scrubbed).not.toContain(fakeKey);
  });

  it("never puts the key in thrown fal error messages", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(`invalid key ${fakeKey}`, { status: 401 });
    });
    await expect(
      callFalKleinEndpoint(
        { fetch: fetchImpl, falKey: fakeKey },
        {
          url: "https://fal.run/fal-ai/flux-2/klein/4b",
          modelId: "fal-ai/flux-2/klein/4b",
          generationCounter: createGenerationCounter(5),
          body: { prompt: "x" },
        },
      ),
    ).rejects.toSatisfy((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain(fakeKey);
      return true;
    });
  });
});

describe("downloadFalImageBytes (unit)", () => {
  const fakeKey = "fal-test-secret-key-abcdef";
  const allowedImageUrl = "https://v3b.fal.media/files/test/out.png";
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  it("rejects a non-fal URL without downloading", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("download fetch must not run");
    });
    await expect(
      downloadFalImageBytes(fetchImpl, "https://cdn.example.com/out.png", fakeKey),
    ).rejects.toThrow("fal image download URL host is not allowed");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("follows an allowed redirect and sends X-Fal-Store-IO: 0 on each GET", async () => {
    const redirectTarget = "https://v3b.fal.media/files/test/out-final.png";
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        expect(headerValue(init?.headers, FAL_STORE_IO_HEADER)).toBe("0");
        expect(init?.redirect).toBe("manual");
        if (url === allowedImageUrl) {
          return new Response(null, {
            status: 302,
            headers: { location: redirectTarget },
          });
        }
        if (url === redirectTarget) {
          return new Response(pngBytes, {
            status: 200,
            headers: { "content-type": "image/png" },
          });
        }
        throw new Error(`unexpected url ${url}`);
      },
    );

    const bytes = await downloadFalImageBytes(fetchImpl, allowedImageUrl, fakeKey);
    expect(bytes).toEqual(pngBytes);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects an off-host redirect Location", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        expect(init?.redirect).toBe("manual");
        return new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/steal.png" },
        });
      },
    );
    await expect(
      downloadFalImageBytes(fetchImpl, allowedImageUrl, fakeKey),
    ).rejects.toThrow("fal image download URL host is not allowed");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects userinfo in download URLs", () => {
    const url = new URL("https://v3b.fal.media/files/x.png");
    url.username = "example-user";
    url.password = "example-password";
    expect(() => assertAllowedFalImageDownloadUrl(url.toString())).toThrow(
      "fal image download URL must not include userinfo",
    );
  });
});

describe("runFiveExerciseMediaTest (unit, fake fetch)", () => {
  const fakeKey = "fal-test-secret-key-abcdef";
  const allowedHost = "https://v3b.fal.media/files/test";

  it("never writes the fal key to manifest or logs", async () => {
    const logLines: string[] = [];
    const outputDir = mkdtempSync(join(tmpdir(), "media-test-run-"));

    let genIndex = 0;
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://fal.run/")) {
        genIndex += 1;
        expect(headerValue(init?.headers, FAL_STORE_IO_HEADER)).toBe("0");
        return new Response(
          JSON.stringify({
            images: [{ url: `${allowedHost}/out-${genIndex}.png` }],
            seed: 1000 + genIndex,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith(allowedHost)) {
        expect(headerValue(init?.headers, FAL_STORE_IO_HEADER)).toBe("0");
        expect(init?.redirect).toBe("manual");
        return new Response(pngBytes, { status: 200 });
      }
      throw new Error(`unexpected fetch url ${url}`);
    };

    const manifest = await runFiveExerciseMediaTest({
      fetch: fetchImpl,
      falKey: fakeKey,
      outputDir,
      logger: {
        info: (m) => logLines.push(m),
        error: (m) => logLines.push(m),
      },
    });

    expect(manifest.totalGenerations).toBe(10);
    const manifestText = readFileSync(join(outputDir, "manifest.json"), "utf8");
    expect(manifestText).not.toContain(fakeKey);
    for (const line of logLines) {
      expect(line).not.toContain(fakeKey);
    }
  });

  it("does not call fetch once the generation cap is hit", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 500 }));
    const counter = createGenerationCounter(1);
    counter.tick();
    await expect(
      callFalKleinEndpoint(
        { fetch: fetchImpl, falKey: "unused" },
        {
          url: "https://fal.run/fal-ai/flux-2/klein/4b",
          modelId: "fal-ai/flux-2/klein/4b",
          generationCounter: counter,
          body: { prompt: "x" },
        },
      ),
    ).rejects.toThrow(GenerationCapError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POSTs end image to klein edit with start URL reference and manifest fields", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "media-test-run-"));
    const startUrl = `${allowedHost}/bridge-start.png`;
    const endUrl = `${allowedHost}/bridge-end.png`;
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const postBodies: Array<{ url: string; body: Record<string, unknown> }> = [];

    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://fal.run/") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        postBodies.push({ url, body });
        const isEdit = url === FAL_EDIT_URL;
        return new Response(
          JSON.stringify({
            images: [{ url: isEdit ? endUrl : startUrl }],
            seed: isEdit ? 4242 : 1111,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith(allowedHost)) {
        return new Response(pngBytes, { status: 200 });
      }
      throw new Error(`unexpected fetch url ${url}`);
    };

    const manifest = await runFiveExerciseMediaTest({
      fetch: fetchImpl,
      falKey: fakeKey,
      outputDir,
      downloadBytes: async (url) => {
        if (!url.startsWith(allowedHost)) {
          throw new Error("bad url");
        }
        return pngBytes;
      },
    });

    const editPosts = postBodies.filter((p) => p.url === FAL_EDIT_URL);
    expect(editPosts.length).toBeGreaterThan(0);
    const firstEdit = editPosts[0]?.body;
    expect(firstEdit?.image_urls).toEqual([startUrl]);
    expect(firstEdit?.image_size).toEqual(IMAGE_SIZE_1MP);
    expect(firstEdit?.num_images).toBe(1);

    const bridgeEnd = manifest.generations.find(
      (g) => g.exerciseId === "bridge" && g.phase === "end",
    );
    expect(bridgeEnd).toBeDefined();
    expect(bridgeEnd?.endpoint).toBe(FAL_EDIT_URL);
    expect(bridgeEnd?.seed).toBe(4242);
    expect(bridgeEnd?.prompt).toBe(buildExerciseImagePrompt("bridge", "end"));
    expect(bridgeEnd?.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("safeLogMessage redacts keys for CLI-style logging", () => {
    const line = safeLogMessage(`failed with ${fakeKey}`, fakeKey);
    expect(line).not.toContain(fakeKey);
  });
});
