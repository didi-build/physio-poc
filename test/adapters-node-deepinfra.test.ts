import { describe, expect, it, vi } from "vitest";
import { createImageGenerationPort } from "../src/adapters/node/create-image-generation-port.js";
import {
  DEEPINFRA_FLUX_KLEIN_IMAGE_SEED,
  DEEPINFRA_IMAGE_JSON_MAX_BYTES,
  DEEPINFRA_IMAGES_EDITS_URL,
  DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL,
  DeepInfraFluxKleinImageGeneration,
  isModelEditUnsupportedResponse,
} from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { buildStartImagePrompt } from "../src/domain/exercise-media-prompts.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  expectConsoleCallsLeakFree,
  expectThrownErrorLeakFree,
  jsonEscapedNoteFragment,
  restoreConsoleSpies,
  spyAllConsoleLevels,
} from "./helpers/console-log-leak-assertions.js";

function b64Png(payload: string): string {
  return btoa(payload);
}

async function expectLeakFreeProviderError(
  run: () => Promise<unknown>,
  expectations: { note?: string; jsonBody?: string; apiKey: string },
  code: string,
): Promise<void> {
  const consoleSpies = spyAllConsoleLevels();
  try {
    await expect(run()).rejects.toSatisfy((err: unknown) => {
      expect(err).toMatchObject({ code, message: code });
      expectThrownErrorLeakFree(err, expectations);
      console.error(err);
      return true;
    });
    expectConsoleCallsLeakFree(consoleSpies, expectations);
  } finally {
    restoreConsoleSpies(consoleSpies);
  }
}

describe("isModelEditUnsupportedResponse (unit)", () => {
  it("matches explicit model-does-not-support-edits wording", () => {
    expect(isModelEditUnsupportedResponse("FLUX model does not support edits")).toBe(
      true,
    );
    expect(isModelEditUnsupportedResponse("edit not supported for this model")).toBe(
      true,
    );
    expect(isModelEditUnsupportedResponse('{"detail":"unsupported for edit"}')).toBe(
      true,
    );
  });

  it("rejects generic validation and auth bodies", () => {
    expect(
      isModelEditUnsupportedResponse(
        JSON.stringify({ detail: [{ msg: "field required", type: "value_error" }] }),
      ),
    ).toBe(false);
    expect(isModelEditUnsupportedResponse("Unauthorized")).toBe(false);
    expect(isModelEditUnsupportedResponse("Payment required")).toBe(false);
  });
});

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
    expect(seen[0]?.url).toBe(DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL);
    expect(String(seen[0]?.init?.body)).toBe(
      JSON.stringify({
        model: "black-forest-labs/FLUX-2-klein-4b",
        prompt,
        size: "1024x1024",
        n: 1,
        response_format: "b64_json",
        seed: DEEPINFRA_FLUX_KLEIN_IMAGE_SEED,
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("generates end image via multipart edits with literal edit URL and start bytes", async () => {
    const startBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0a]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe(DEEPINFRA_IMAGES_EDITS_URL);
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect([...form.keys()].sort()).toEqual([
        "image",
        "model",
        "prompt",
        "response_format",
      ]);
      expect(form.get("model")).toBe("black-forest-labs/FLUX-2-klein-4b");
      expect(form.get("prompt")).toBe("end prompt");
      expect(form.get("response_format")).toBe("b64_json");
      expect(form.get("size")).toBeNull();
      const file = form.get("image");
      expect(file).toBeInstanceOf(Blob);
      const received = new Uint8Array(await (file as Blob).arrayBuffer());
      expect(received).toEqual(startBytes);
      return new Response(
        JSON.stringify({ data: [{ b64_json: b64Png("END-EDIT") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await generator.generateEndImage("end prompt", {
      startReferenceImage: { bytes: startBytes, contentType: "image/png" },
    });
  });

  it("falls back to prompt-only end generation when edit body explicitly says edits unsupported", async () => {
    const generationsBodies: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL) {
        generationsBodies.push(String(init?.body));
        return new Response(JSON.stringify({ data: [{ b64_json: b64Png("GEN") }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === DEEPINFRA_IMAGES_EDITS_URL) {
        return new Response(
          JSON.stringify({ detail: "model does not support edits" }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await generator.generateStartAndEndImages({
      startPrompt: "start only",
      endPrompt: "fallback end prompt",
    });

    expect(generationsBodies).toHaveLength(2);
    expect(generationsBodies[0]).toContain(`"seed":${DEEPINFRA_FLUX_KLEIN_IMAGE_SEED}`);
    expect(generationsBodies[1]).toContain("fallback end prompt");
    expect(generationsBodies[1]).toContain(`"seed":${DEEPINFRA_FLUX_KLEIN_IMAGE_SEED}`);
  });

  it("does not fall back on edit HTTP 422 validation errors", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL) {
        return new Response(JSON.stringify({ data: [{ b64_json: b64Png("START") }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ detail: [{ msg: "field required", type: "value_error" }] }),
        { status: 422, headers: { "content-type": "application/json" } },
      );
    });

    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateStartAndEndImages({ startPrompt: "start", endPrompt: "end" }),
    ).rejects.toMatchObject({
      code: "image_generation_request_failed",
      statusCode: 422,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not include provider bodies, API keys, or regeneration notes in thrown errors", async () => {
    const cases = [
      { label: "double quote", note: 'Adjust "knee out"' },
      { label: "newline", note: "line one\nline two" },
    ] as const;

    for (const { note } of cases) {
      const jsonBody = JSON.stringify({ detail: note, echo: note });
      const fetchImpl = vi.fn(async () => new Response(jsonBody, { status: 401 }));
      const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
      const prompt = buildStartImagePrompt({ title: "Bridge", regenerationNote: note });
      await expectLeakFreeProviderError(
        () => generator.generateStartImage(prompt, { regenerationNote: note }),
        { note, jsonBody, apiKey },
        "image_generation_request_failed",
      );
    }
  });

  it("does not include regeneration notes when the provider returns JSON-escaped echo bodies", async () => {
    const note = 'cue "deep"';
    const jsonBody = '{"error":"cue \\"deep\\""}';
    const fetchImpl = vi.fn(async () => new Response(jsonBody, { status: 403 }));
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateStartImage("prompt", { regenerationNote: note }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toMatchObject({
        code: "image_generation_request_failed",
        message: "image_generation_request_failed",
      });
      expectThrownErrorLeakFree(err, { note, jsonBody, apiKey });
      expect(String(err)).not.toContain(jsonEscapedNoteFragment(note));
      return true;
    });
  });

  async function leakCase(
    label: string,
    fetchImpl: NonNullable<
      ConstructorParameters<typeof DeepInfraFluxKleinImageGeneration>[0]["fetchImpl"]
    >,
    run: (g: DeepInfraFluxKleinImageGeneration) => Promise<unknown>,
  ) {
    const note = `leak probe ${label}`;
    const jsonBody = JSON.stringify({
      detail: note,
      Authorization: `Bearer ${apiKey}`,
    });
    await expectLeakFreeProviderError(
      () => run(new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl })),
      { note, jsonBody, apiKey },
      label.startsWith("invalid") || label.startsWith("oversize")
        ? "image_generation_response_invalid"
        : label.startsWith("timeout") || label.startsWith("network")
          ? "image_generation_network_failed"
          : "image_generation_request_failed",
    );
  }

  it("does not leak the sentinel key on 403 edit failures", async () => {
    const note = 'end "leak"';
    const jsonBody = JSON.stringify({ detail: note });
    const startBytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === DEEPINFRA_IMAGES_EDITS_URL) {
        return new Response(jsonBody, { status: 403 });
      }
      throw new Error(`unexpected ${url}`);
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expectLeakFreeProviderError(
      () =>
        generator.generateEndImage("end", {
          startReferenceImage: { bytes: startBytes, contentType: "image/png" },
        }),
      { note, jsonBody, apiKey },
      "image_generation_request_failed",
    );
  });

  it("does not leak the sentinel key on 429 and 5xx generation failures", async () => {
    for (const status of [429, 500] as const) {
      const jsonBody = JSON.stringify({ detail: "rate limited" });
      const fetchImpl = vi.fn(async () => new Response(jsonBody, { status }));
      await leakCase(String(status), fetchImpl, (g) => g.generateStartImage("prompt"));
    }
  });

  it("does not leak the sentinel key on invalid JSON, oversize JSON, or bad base64", async () => {
    const jsonBody = '{"data":[{"b64_json":"!!!not-base64!!!"}]}';
    const invalidJsonFetch = vi.fn(
      async () =>
        new Response("{not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await leakCase("invalid-json", invalidJsonFetch, (g) =>
      g.generateStartImage("prompt"),
    );

    const badB64Fetch = vi.fn(
      async () =>
        new Response(jsonBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await leakCase("invalid-b64", badB64Fetch, (g) => g.generateStartImage("prompt"));

    const over = DEEPINFRA_IMAGE_JSON_MAX_BYTES + 1;
    const oversizeFetch = vi.fn(
      async () =>
        new Response("x".repeat(over), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(over),
          },
        }),
    );
    await leakCase("oversize-json", oversizeFetch, (g) =>
      g.generateStartImage("prompt"),
    );
  });

  it("enforces the JSON size cap while streaming without content-length", async () => {
    const overCap = DEEPINFRA_IMAGE_JSON_MAX_BYTES + 1;
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(overCap));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_response_invalid",
      statusCode: 502,
    });
  });

  it("accepts a response whose content-length is exactly at the cap and rejects one byte over", async () => {
    const body = JSON.stringify({ data: [{ b64_json: b64Png("OK") }] });
    const atCapFetch = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(DEEPINFRA_IMAGE_JSON_MAX_BYTES),
          },
        }),
    );
    const generatorAtCap = new DeepInfraFluxKleinImageGeneration({
      apiKey,
      fetchImpl: atCapFetch,
    });
    await expect(generatorAtCap.generateStartImage("prompt")).resolves.toMatchObject({
      contentType: "image/png",
    });

    const overCapFetch = vi.fn(
      async () =>
        new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(DEEPINFRA_IMAGE_JSON_MAX_BYTES + 1),
          },
        }),
    );
    const generatorOver = new DeepInfraFluxKleinImageGeneration({
      apiKey,
      fetchImpl: overCapFetch,
    });
    await expect(generatorOver.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_response_invalid",
      statusCode: 502,
    });
  });

  it("rejects valid JSON when b64_json is null", async () => {
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

  it("rejects unparseable JSON bodies", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("not-json{", {
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

  it("maps timeout aborts to image_generation_network_failed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    });
    const generator = new DeepInfraFluxKleinImageGeneration({
      apiKey,
      fetchImpl,
      requestTimeoutMs: 1,
    });
    const consoleSpies = spyAllConsoleLevels();
    try {
      await expect(generator.generateStartImage("prompt")).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toMatchObject({
            code: "image_generation_network_failed",
            statusCode: 504,
            message: "image_generation_network_failed",
          });
          expectThrownErrorLeakFree(err, { apiKey });
          console.error(err);
          return true;
        },
      );
      expectConsoleCallsLeakFree(consoleSpies, { apiKey });
    } finally {
      restoreConsoleSpies(consoleSpies);
    }
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
