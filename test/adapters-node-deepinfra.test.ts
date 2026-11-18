import { describe, expect, it, vi } from "vitest";
import { createImageGenerationPort } from "../src/adapters/node/create-image-generation-port.js";
import {
  DEEPINFRA_IMAGE_JSON_MAX_BYTES,
  DeepInfraFluxKleinImageGeneration,
} from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { buildStartImagePrompt } from "../src/domain/exercise-media-prompts.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  expectConsoleCallsLeakFree,
  expectThrownErrorLeakFree,
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

function b64Png(payload: string): string {
  return btoa(payload);
}

describe("DeepInfraFluxKleinImageGeneration (unit, mocked fetch)", () => {
  const apiKey = "deepinfra-sentinel-key-must-not-appear-in-errors";

  it("POSTs start image to OpenAI-compatible generations with literal body and URL", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      seen.push({ url, init });
      return new Response(
        JSON.stringify({ data: [{ b64_json: b64Png("PNG-START") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const prompt = buildStartImagePrompt({
      title: "Bridge",
      regenerationNote: 'cue "knee"',
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    const image = await generator.generateStartImage(prompt);

    expect(image.contentType).toBe("image/png");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.deepinfra.com/v1/openai/images/generations");
    expect(seen[0]?.init?.method).toBe("POST");
    expect(headerValue(seen[0]?.init?.headers, "Authorization")).toBe(
      `Bearer ${apiKey}`,
    );
    expect(String(seen[0]?.init?.body)).toBe(
      JSON.stringify({
        model: "black-forest-labs/FLUX-2-klein-4b",
        prompt,
        size: "1024x1024",
        n: 1,
        response_format: "b64_json",
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("generates end image via multipart edits from the start image bytes", async () => {
    const seen: Array<{ url: string; method?: string; bodyKind: string }> = [];
    const startBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0a]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v1/openai/images/generations")) {
        seen.push({ url, method: init?.method, bodyKind: typeof init?.body });
        return new Response(JSON.stringify({ data: [{ b64_json: b64Png("START") }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/v1/images/edits")) {
        seen.push({
          url,
          method: init?.method,
          bodyKind: init?.body?.constructor.name ?? "",
        });
        expect(init?.body).toBeInstanceOf(FormData);
        const form = init?.body as FormData;
        expect(form.get("model")).toBe("black-forest-labs/FLUX-2-klein-4b");
        expect(form.get("prompt")).toBe("end prompt");
        expect(form.get("size")).toBe("1024x1024");
        expect(form.get("response_format")).toBe("b64_json");
        const file = form.get("image");
        expect(file).toBeInstanceOf(Blob);
        return new Response(
          JSON.stringify({ data: [{ b64_json: b64Png("END-EDIT") }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await generator.generateEndImage("end prompt", {
      startReferenceImage: { bytes: startBytes, contentType: "image/png" },
    });

    expect(seen.some((row) => row.url.endsWith("/v1/images/edits"))).toBe(true);
    expect(seen.filter((row) => row.url.endsWith("/v1/images/edits"))).toHaveLength(1);
    void startBytes;
  });

  it("falls back to prompt-only end generation on HTTP 422 even when the body has no unsupported keywords", async () => {
    const generationsCalls: string[] = [];
    const editCalls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v1/openai/images/generations")) {
        generationsCalls.push(String(init?.body));
        return new Response(
          JSON.stringify({ data: [{ b64_json: b64Png("FALLBACK-END-422") }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/v1/images/edits")) {
        editCalls.push(url);
        return new Response(JSON.stringify({ detail: [{ msg: "field required", type: "value_error" }] }), {
          status: 422,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await generator.generateStartAndEndImages({
      startPrompt: "start only",
      endPrompt: "fallback end prompt",
    });

    expect(editCalls).toHaveLength(1);
    expect(generationsCalls).toHaveLength(2);
    expect(generationsCalls[1]).toContain("fallback end prompt");
  });

  it("falls back to prompt-only end generation when edit response is unsupported", async () => {
    const generationsCalls: string[] = [];
    const editCalls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v1/openai/images/generations")) {
        generationsCalls.push(String(init?.body));
        return new Response(
          JSON.stringify({ data: [{ b64_json: b64Png("FALLBACK-END") }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/v1/images/edits")) {
        editCalls.push(url);
        return new Response(JSON.stringify({ detail: "model unsupported for edits" }), {
          status: 422,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    const end = await generator.generateStartAndEndImages({
      startPrompt: "start only",
      endPrompt: "fallback end prompt",
    });

    expect(editCalls).toHaveLength(1);
    expect(generationsCalls).toHaveLength(2);
    expect(generationsCalls[1]).toContain("fallback end prompt");
    expect(end.end.bytes.length).toBeGreaterThan(0);
  });

  it("maps HTTP failures to ImageGenerationError without echoing bodies or the api key", async () => {
    const note = 'Adjust "knee out"';
    const jsonBody = JSON.stringify({
      detail: note,
      echo: note,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const fetchImpl = vi.fn(async () => new Response(jsonBody, { status: 401 }));
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    const prompt = buildStartImagePrompt({ title: "Bridge", regenerationNote: note });
    const consoleSpies = spyAllConsoleLevels();
    try {
      await expect(
        generator.generateStartImage(prompt, { regenerationNote: note }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toMatchObject({
          code: "image_generation_request_failed",
          message: "image_generation_request_failed",
          statusCode: 401,
        });
        expectThrownErrorLeakFree(err, { note, jsonBody, apiKey });
        console.error(err);
        return true;
      });
      expectConsoleCallsLeakFree(consoleSpies, { note, jsonBody, apiKey });
    } finally {
      restoreConsoleSpies(consoleSpies);
    }
  });

  it("rejects image JSON payloads over the response size cap", async () => {
    const overCap = "x".repeat(DEEPINFRA_IMAGE_JSON_MAX_BYTES + 1);
    const fetchImpl = vi.fn(async () =>
      new Response(overCap, {
        status: 200,
        headers: { "content-type": "application/json", "content-length": String(overCap.length) },
      }),
    );
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_response_invalid",
      statusCode: 502,
    });
  });

  it("rejects invalid JSON image payloads", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [{ b64_json: null }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_response_invalid",
      statusCode: 502,
    });
  });

  it("requires start reference bytes for standalone end generation", async () => {
    const generator = new DeepInfraFluxKleinImageGeneration({
      apiKey,
      fetchImpl: vi.fn(),
    });
    await expect(generator.generateEndImage("end")).rejects.toMatchObject({
      code: "start_reference_required",
      statusCode: 400,
    });
  });

  it("surfaces timeout as request failure without leaking the api key", async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new DOMException("The operation was aborted.", "TimeoutError");
      throw err;
    });
    const generator = new DeepInfraFluxKleinImageGeneration({
      apiKey,
      fetchImpl,
      requestTimeoutMs: 1,
    });
    await expect(generator.generateStartImage("prompt")).rejects.toSatisfy(
      (err: unknown) => {
        expectThrownErrorLeakFree(err, { apiKey });
        return true;
      },
    );
  });
});

describe("createImageGenerationPort (unit)", () => {
  it("returns FakeImageGeneration when PHYSIO_DEEPINFRA_API_KEY is missing or blank", () => {
    expect(createImageGenerationPort({})).toBeInstanceOf(FakeImageGeneration);
    expect(createImageGenerationPort({ PHYSIO_DEEPINFRA_API_KEY: "" })).toBeInstanceOf(
      FakeImageGeneration,
    );
    expect(
      createImageGenerationPort({ PHYSIO_DEEPINFRA_API_KEY: "   " }),
    ).toBeInstanceOf(FakeImageGeneration);
  });

  it("returns DeepInfraFluxKleinImageGeneration when PHYSIO_DEEPINFRA_API_KEY is set", () => {
    const port = createImageGenerationPort({ PHYSIO_DEEPINFRA_API_KEY: "present-key" });
    expect(port).toBeInstanceOf(DeepInfraFluxKleinImageGeneration);
  });
});
