import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAL_STORE_IO_HEADER,
  FAL_STORE_IO_VALUE,
} from "../scripts/media-test/constants.js";
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
} from "../scripts/media-test/run-five-exercise-test.js";

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
  it("throws after MAX_GENERATIONS_PER_RUN ticks", () => {
    const counter = createGenerationCounter(3);
    counter.tick();
    counter.tick();
    counter.tick();
    expect(() => counter.tick()).toThrow(GenerationCapError);
  });
});

describe("media-test fal headers (unit)", () => {
  it("sets X-Fal-Store-IO to 0 and Authorization Key", () => {
    const headers = buildFalHeaders("test-key-example-12345");
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
});

describe("runFiveExerciseMediaTest (unit, fake fetch)", () => {
  it("never writes the fal key to manifest or logs", async () => {
    const fakeKey = "fal-test-secret-key-abcdef";
    const logLines: string[] = [];
    const outputDir = mkdtempSync(join(tmpdir(), "media-test-run-"));

    let callIndex = 0;
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://fal.run/")) {
        callIndex += 1;
        expect(init?.headers).toMatchObject({
          [FAL_STORE_IO_HEADER]: FAL_STORE_IO_VALUE,
        });
        const auth = (init?.headers as Record<string, string>).Authorization;
        expect(auth).toBe(`Key ${fakeKey}`);
        return new Response(
          JSON.stringify({
            images: [{ url: `https://cdn.example.com/out-${callIndex}.png` }],
            seed: 1000 + callIndex,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("https://cdn.example.com/")) {
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

  it("callFalKleinEndpoint enforces cap before fetch", async () => {
    const counter = createGenerationCounter(1);
    counter.tick();
    await expect(
      callFalKleinEndpoint(
        {
          fetch: async () => new Response("{}", { status: 500 }),
          falKey: "unused",
        },
        {
          url: "https://fal.run/fal-ai/flux-2/klein/4b",
          modelId: "fal-ai/flux-2/klein/4b",
          generationCounter: counter,
          body: { prompt: "x" },
        },
      ),
    ).rejects.toThrow(GenerationCapError);
  });
});
