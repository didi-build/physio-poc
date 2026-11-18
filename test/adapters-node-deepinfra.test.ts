import { describe, expect, it, vi } from "vitest";
import { createImageGenerationPort } from "../src/adapters/node/create-image-generation-port.js";
import {
  DEEPINFRA_IMAGE_JSON_MAX_BYTES,
  DeepInfraFluxKleinImageGeneration,
} from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { ImageGenerationError } from "../src/storage/ports/image-generation.js";
import { buildStartImagePrompt } from "../src/domain/exercise-media-prompts.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  expectConsoleCallsLeakFree,
  expectThrownErrorLeakFree,
  jsonEscapedNoteFragment,
  restoreConsoleSpies,
  spyAllConsoleLevels,
} from "./helpers/console-log-leak-assertions.js";

const GENERATIONS_URL = "https://api.deepinfra.com/v1/openai/images/generations";
const EDITS_URL = "https://api.deepinfra.com/v1/images/edits";
const REQUEST_TIMEOUT_MS = 120_000;

function b64Png(payload: string): string {
  return btoa(payload);
}

function buildOversizeValidJsonBody(): string {
  const buildBody = (padLen: number) =>
    JSON.stringify({
      data: [{ b64_json: b64Png("OK") }],
      pad: "p".repeat(padLen),
    });
  let padLen = DEEPINFRA_IMAGE_JSON_MAX_BYTES;
  let body = buildBody(padLen);
  while (body.length <= DEEPINFRA_IMAGE_JSON_MAX_BYTES) {
    padLen += 4096;
    body = buildBody(padLen);
  }
  return body;
}

function jsonBodyWithExactByteLength(targetBytes: number): string {
  const shell = (padLen: number) =>
    JSON.stringify({
      data: [{ b64_json: b64Png("OK") }],
      pad: "p".repeat(padLen),
    });
  let lo = 0;
  let hi = targetBytes;
  let best = shell(0);
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const body = shell(mid);
    if (body.length === targetBytes) {
      return body;
    }
    if (body.length < targetBytes) {
      best = body;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best.length === targetBytes) {
    return best;
  }
  throw new Error(
    `could not build JSON of byte length ${targetBytes} (closest ${best.length})`,
  );
}

async function expectLeakFreeProviderError(
  run: () => Promise<unknown>,
  expectations: { note?: string; jsonBody?: string; apiKey: string },
  code: string,
  providerBodyAttachedAsCause?: string | object,
): Promise<void> {
  const consoleSpies = spyAllConsoleLevels();
  try {
    await expect(run()).rejects.toSatisfy((err: unknown) => {
      expect(err).toMatchObject({ code, message: code });
      if (providerBodyAttachedAsCause !== undefined) {
        (err as ImageGenerationError).cause = providerBodyAttachedAsCause;
      }
      expectThrownErrorLeakFree(err, expectations);
      console.error(err);
      return true;
    });
    expectConsoleCallsLeakFree(consoleSpies, expectations);
  } finally {
    restoreConsoleSpies(consoleSpies);
  }
}

describe("DeepInfraFluxKleinImageGeneration (unit, mocked fetch)", () => {
  const apiKey = "deepinfra-sentinel-key-must-not-appear-in-errors";

  it("POSTs start image to OpenAI-compatible generations with literal body, URL, and timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
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
    expect(seen[0]?.url).toBe(GENERATIONS_URL);
    expect(String(seen[0]?.init?.body)).toBe(
      JSON.stringify({
        model: "black-forest-labs/FLUX-2-klein-4b",
        prompt,
        size: "1024x1024",
        n: 1,
        response_format: "b64_json",
      }),
    );
    expect(timeoutSpy).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    expect(seen[0]?.init?.signal).toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    timeoutSpy.mockRestore();
  });

  it("generates end image via multipart edits with literal edit URL and start bytes", async () => {
    const startBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0a]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toBe(EDITS_URL);
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

  it("does not call generations when edit fails even if the body claims edits are unsupported", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url === GENERATIONS_URL) {
        return new Response(JSON.stringify({ data: [{ b64_json: b64Png("START") }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === EDITS_URL) {
        return new Response(
          JSON.stringify({ detail: "model does not support edits" }),
          {
            status: 401,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });

    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateStartAndEndImages({ startPrompt: "start", endPrompt: "end" }),
    ).rejects.toMatchObject({
      code: "image_generation_request_failed",
      statusCode: 401,
    });
    expect(calls).toEqual([GENERATIONS_URL, EDITS_URL]);
  });

  it("does not treat generic unsupported bodies on edit failures as a reason to call generations", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url === EDITS_URL) {
        return new Response(JSON.stringify({ detail: "unsupported" }), { status: 400 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateEndImage("end", {
        startReferenceImage: { bytes: new Uint8Array([1]), contentType: "image/png" },
      }),
    ).rejects.toMatchObject({
      code: "image_generation_request_failed",
      statusCode: 400,
    });
    expect(calls).toEqual([EDITS_URL]);
  });

  it("surfaces edit HTTP 422 validation errors without a generations call", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === GENERATIONS_URL) {
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
    expect(fetchImpl.mock.calls.map((c) => String(c[0]))).toEqual([
      GENERATIONS_URL,
      EDITS_URL,
    ]);
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
    code: string,
    providerBodyAttachedAsCause?: string | object,
  ) {
    const note = `leak probe ${label}`;
    const jsonBody = JSON.stringify({ detail: note, echo: note });
    await expectLeakFreeProviderError(
      () => run(new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl })),
      { note, jsonBody, apiKey },
      code,
      providerBodyAttachedAsCause,
    );
  }

  it("does not leak the sentinel key on 403 edit failures", async () => {
    const note = 'end "leak"';
    const jsonBody = JSON.stringify({ detail: note });
    const startBytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === EDITS_URL) {
        return new Response(jsonBody, { status: 403 });
      }
      throw new Error(`unexpected ${url}`);
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateEndImage("end", {
        startReferenceImage: { bytes: startBytes, contentType: "image/png" },
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toMatchObject({
        code: "image_generation_request_failed",
        statusCode: 403,
        message: "image_generation_request_failed",
      });
      expectThrownErrorLeakFree(err, { note, jsonBody, apiKey });
      return true;
    });
  });

  it("does not leak the sentinel key on 429 and 5xx generation failures", async () => {
    for (const status of [429, 500] as const) {
      const providerJson = JSON.stringify({ detail: "rate limited" });
      const fetchImpl = vi.fn(async () => new Response(providerJson, { status }));
      await leakCase(
        String(status),
        fetchImpl,
        (g) => g.generateStartImage("prompt"),
        "image_generation_request_failed",
        JSON.parse(providerJson) as object,
      );
    }
  });

  it("does not leak the sentinel key on non-timeout fetch failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await leakCase(
      "fetch-type-error",
      fetchImpl,
      (g) => g.generateStartImage("prompt"),
      "image_generation_network_failed",
    );
  });

  it("does not leak the sentinel key on invalid JSON, oversize JSON, bad base64, or parsed cause", async () => {
    const invalidJsonBody = "{not-json";
    const invalidJsonFetch = vi.fn(
      async () =>
        new Response(invalidJsonBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await leakCase(
      "invalid-json",
      invalidJsonFetch,
      (g) => g.generateStartImage("prompt"),
      "image_generation_response_invalid",
      invalidJsonBody,
    );

    const badB64Json = JSON.stringify({ data: [{ b64_json: "!!!not-base64!!!" }] });
    const badB64Fetch = vi.fn(
      async () =>
        new Response(badB64Json, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await leakCase(
      "invalid-b64",
      badB64Fetch,
      (g) => g.generateStartImage("prompt"),
      "image_generation_response_invalid",
      JSON.parse(badB64Json) as object,
    );

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
    await leakCase(
      "oversize-json",
      oversizeFetch,
      (g) => g.generateStartImage("prompt"),
      "image_generation_response_invalid",
    );
  });

  it("does not leak the sentinel key when the response body stalls past timeout while streaming", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull() {
              throw new DOMException("signal timed out", "TimeoutError");
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await leakCase(
      "body-read-timeout",
      fetchImpl,
      (g) => g.generateStartImage("prompt"),
      "image_generation_network_failed",
    );
  });

  it("does not leak the sentinel key when the response body stream resets mid-read", async () => {
    let pulls = 0;
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulls += 1;
              if (pulls === 1) {
                controller.enqueue(new Uint8Array([123]));
                return;
              }
              throw new TypeError("Failed to fetch");
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await leakCase(
      "body-read-reset",
      fetchImpl,
      (g) => g.generateStartImage("prompt"),
      "image_generation_network_failed",
    );
  });

  it("does not leak the sentinel key on streaming oversize JSON without content-length", async () => {
    const body = buildOversizeValidJsonBody();
    const bytes = new TextEncoder().encode(body);
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    await leakCase(
      "streaming-oversize",
      fetchImpl,
      (g) => g.generateStartImage("prompt"),
      "image_generation_response_invalid",
    );
  });

  it("maps stalled body read past timeout to image_generation_network_failed", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull() {
              throw new DOMException("signal timed out", "TimeoutError");
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_network_failed",
      statusCode: 504,
    });
  });

  it("maps mid-body stream reset to image_generation_network_failed", async () => {
    let pulls = 0;
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulls += 1;
              if (pulls === 1) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                return;
              }
              throw new TypeError("network error");
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_network_failed",
      statusCode: 504,
    });
  });

  it("maps non-timeout fetch errors to image_generation_network_failed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("failed to fetch");
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_network_failed",
      statusCode: 504,
    });
  });

  it("enforces the JSON size cap while streaming without content-length", async () => {
    const body = buildOversizeValidJsonBody();
    const bytes = new TextEncoder().encode(body);
    const chunkSize = 256 * 1024;
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                controller.enqueue(bytes.subarray(offset, offset + chunkSize));
              }
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

  it("accepts a JSON body whose byte length is exactly the cap and rejects one byte over", async () => {
    const atCapBody = jsonBodyWithExactByteLength(DEEPINFRA_IMAGE_JSON_MAX_BYTES);
    const overBody = jsonBodyWithExactByteLength(DEEPINFRA_IMAGE_JSON_MAX_BYTES + 1);
    const atCapFetch = vi.fn(
      async () =>
        new Response(atCapBody, {
          status: 200,
          headers: { "content-type": "application/json" },
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
        new Response(overBody, {
          status: 200,
          headers: { "content-type": "application/json" },
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

  it("rejects when content-length exceeds the cap before reading the body", async () => {
    const validSmall = JSON.stringify({ data: [{ b64_json: b64Png("OK") }] });
    const fetchImpl = vi.fn(
      async () =>
        new Response(validSmall, {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(DEEPINFRA_IMAGE_JSON_MAX_BYTES + 1),
          },
        }),
    );
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_response_invalid",
      statusCode: 502,
    });
  });

  it("rejects empty JSON bodies", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("", {
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

  it("maps timeout aborts on fetch to image_generation_network_failed", async () => {
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
