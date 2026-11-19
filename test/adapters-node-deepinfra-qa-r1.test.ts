import { describe, expect, it, vi } from "vitest";
import { DeepInfraFluxKleinImageGeneration } from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { handleRequest } from "../src/http/app.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import {
  exerciseMediaSessionCookie,
  exerciseMediaTestDeps,
} from "./helpers/exercise-media-http.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  openMigratedDatabase,
  seedPractitioner,
  seedExercise,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { FIXTURE_VERSION_ID } from "./helpers/exercise-sqlite-fixture.js";

const GENERATIONS_URL = "https://api.deepinfra.com/v1/openai/images/generations";
const EDITS_URL = "https://api.deepinfra.com/v1/images/edits";
const REQUEST_TIMEOUT_MS = 120_000;
const apiKey = "deepinfra-sentinel-key-must-not-appear-in-errors";

function b64Png(payload: string): string {
  return btoa(payload);
}

function decodeB64(payload: string): Uint8Array {
  const binary = atob(payload);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

const startReference = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  contentType: "image/png",
};

describe("DeepInfra adapter QA round 1 (mocked fetch)", () => {
  it("chains decoded start bytes into edits and returns decoded image bytes", async () => {
    const startB64 = b64Png("PNG-START");
    const endB64 = b64Png("PNG-END");
    let editImageBytes: Uint8Array | null = null;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === GENERATIONS_URL) {
        return new Response(JSON.stringify({ data: [{ b64_json: startB64 }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      expect(url).toBe(EDITS_URL);
      const form = init?.body as FormData;
      const file = form.get("image") as Blob;
      editImageBytes = new Uint8Array(await file.arrayBuffer());
      return new Response(JSON.stringify({ data: [{ b64_json: endB64 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    const { start, end } = await generator.generateStartAndEndImages({
      startPrompt: "start",
      endPrompt: "end",
    });
    const expectedStart = decodeB64(startB64);
    expect(editImageBytes).toEqual(expectedStart);
    expect(start.bytes).toEqual(expectedStart);
    expect(end.bytes).toEqual(decodeB64(endB64));
  });

  function buildOversizeValidJsonBody(): string {
    const buildBody = (padLen: number) =>
      JSON.stringify({
        data: [{ b64_json: b64Png("OK") }],
        pad: "p".repeat(padLen),
      });
    const cap = 12 * 1024 * 1024;
    let padLen = cap;
    let body = buildBody(padLen);
    while (body.length <= cap) {
      padLen += 4096;
      body = buildBody(padLen);
    }
    return body;
  }

  it("cancels the body reader when streaming JSON exceeds the byte cap (M7)", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const body = buildOversizeValidJsonBody();
    const bytes = new TextEncoder().encode(body);
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(bytes);
            },
            cancel,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
      code: "image_generation_response_invalid",
      statusCode: 502,
    });
    expect(cancel).toHaveBeenCalled();
  });

  it("sets AbortSignal.timeout(120000) on edits requests", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    let editInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(EDITS_URL);
      editInit = init;
      return new Response(JSON.stringify({ data: [{ b64_json: b64Png("END") }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await generator.generateEndImage("end prompt", {
      startReferenceImage: startReference,
    });
    expect(timeoutSpy).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
    expect(editInit?.signal).toBe(timeoutSpy.mock.results[0]?.value);
    timeoutSpy.mockRestore();
  });

  for (const status of [401, 429, 500] as const) {
    it(`makes exactly one generations call on HTTP ${status}`, async () => {
      const calls: string[] = [];
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        return new Response(JSON.stringify({ detail: "upstream" }), { status });
      });
      const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
      await expect(generator.generateStartImage("prompt")).rejects.toMatchObject({
        code: "image_generation_request_failed",
        statusCode: status,
      });
      expect(calls).toEqual([GENERATIONS_URL]);
    });
  }

  const editHttpCases = [
    { label: "403", status: 403 },
    { label: "429", status: 429 },
    { label: "500", status: 500 },
    { label: "503", status: 503 },
  ] as const;

  for (const { label, status } of editHttpCases) {
    it(`edit HTTP ${label}: one edits call, typed request_failed, no generations`, async () => {
      const calls: string[] = [];
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        if (url === GENERATIONS_URL) {
          throw new Error("generations must not run");
        }
        return new Response(JSON.stringify({ detail: "upstream" }), { status });
      });
      const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
      await expect(
        generator.generateEndImage("end", { startReferenceImage: startReference }),
      ).rejects.toMatchObject({
        code: "image_generation_request_failed",
        statusCode: status,
      });
      expect(calls).toEqual([EDITS_URL]);
    });
  }

  it("edit TypeError: one edits call and image_generation_network_failed", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      throw new TypeError("fetch failed");
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateEndImage("end", { startReferenceImage: startReference }),
    ).rejects.toMatchObject({
      code: "image_generation_network_failed",
      statusCode: 504,
    });
    expect(calls).toEqual([EDITS_URL]);
  });

  it("edit stalled body read: one edits call and image_generation_network_failed", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        new ReadableStream({
          pull() {
            throw new DOMException("signal timed out", "TimeoutError");
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateEndImage("end", { startReferenceImage: startReference }),
    ).rejects.toMatchObject({
      code: "image_generation_network_failed",
      statusCode: 504,
    });
    expect(calls).toEqual([EDITS_URL]);
  });

  it("edit invalid JSON on HTTP 200: one edits call and image_generation_response_invalid", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const generator = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
    await expect(
      generator.generateEndImage("end", { startReferenceImage: startReference }),
    ).rejects.toMatchObject({
      code: "image_generation_response_invalid",
      statusCode: 502,
    });
    expect(calls).toEqual([EDITS_URL]);
  });

  for (const body of ["null", "42", JSON.stringify("not-an-object")]) {
    it(`rejects JSON non-object payload ${body}`, async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(body, {
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
  }

  for (const body of [
    "{}",
    JSON.stringify({ data: [] }),
    JSON.stringify({ data: [{}] }),
    JSON.stringify({ data: [{ url: "https://cdn.example/start.png" }] }),
  ]) {
    it(`rejects missing b64_json payload ${body.slice(0, 40)}`, async () => {
      const fetchImpl = vi.fn(
        async () =>
          new Response(body, {
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
  }
});

async function seedDraftVersion(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
) {
  const practitionerId = await seedPractitioner(storage);
  const exerciseId = await seedExercise(storage, practitionerId);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: FIXTURE_VERSION_ID,
      exercise_id: exerciseId,
      status: "draft",
      title: "Heel slide",
      starting_position: "Supine",
    }),
  ]);
  const objectStorage = new InMemoryObjectStorage();
  const media = new PrefixMediaStorage(objectStorage);
  let tick = 0;
  const bootstrap = new ExerciseMediaService(
    storage,
    new FakeImageGeneration(),
    media,
    () => new Date(`2026-10-30T12:00:${String(tick++).padStart(2, "0")}.000Z`),
    () => testOpaqueEntityId(`bootstrap-${tick}`),
  );
  await bootstrap.generateInitialMediaForVersion({
    practitionerId,
    exerciseVersionId: FIXTURE_VERSION_ID,
  });
  return { practitionerId, versionId: FIXTURE_VERSION_ID, objectStorage };
}

function mediaRequest(
  url: string,
  deps: ReturnType<typeof exerciseMediaTestDeps>,
  init: RequestInit = {},
) {
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", exerciseMediaSessionCookie(deps));
  return new Request(url, { ...withCsrf, headers });
}

describe("DeepInfra HTTP route QA round 1", () => {
  for (const [code, setupFetch] of [
    [
      "image_generation_request_failed",
      () =>
        vi.fn(
          async () => new Response(JSON.stringify({ detail: "x" }), { status: 401 }),
        ),
    ],
    [
      "image_generation_response_invalid",
      () =>
        vi.fn(
          async () =>
            new Response("{", {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ),
    ],
    [
      "image_generation_network_failed",
      () =>
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
    ],
  ] as const) {
    it(`returns code-only 502 body for ${code}`, async () => {
      const storage = await openMigratedDatabase();
      try {
        const { practitionerId, versionId, objectStorage } =
          await seedDraftVersion(storage);
        const fetchImpl = setupFetch();
        const deepinfra = new DeepInfraFluxKleinImageGeneration({
          apiKey,
          fetchImpl,
        });
        const deps = exerciseMediaTestDeps(
          storage,
          {
            practitionerId,
            email: "coach@example.com",
            displayName: "Coach",
          },
          { objects: objectStorage, exerciseMediaImages: deepinfra },
        );
        const response = await handleRequest(
          mediaRequest(
            `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/generate`,
            deps,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
            },
          ),
          deps,
        );
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toEqual({ error: code });
      } finally {
        storage.close();
      }
    });
  }

  it("end-only edit failure returns code-only 502 through the route", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId, objectStorage } =
        await seedDraftVersion(storage);
      const calls: string[] = [];
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        if (url === EDITS_URL) {
          return new Response(JSON.stringify({ detail: "forbidden" }), { status: 403 });
        }
        throw new Error(`unexpected ${url}`);
      });
      const deepinfra = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { objects: objectStorage, exerciseMediaImages: deepinfra },
      );
      const response = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/regenerate`,
          deps,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end" }),
          },
        ),
        deps,
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: "image_generation_request_failed",
      });
      expect(calls).toEqual([EDITS_URL]);
    } finally {
      storage.close();
    }
  });

  it("JSON null payload through route: 502 image_generation_response_invalid", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId, objectStorage } =
        await seedDraftVersion(storage);
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === GENERATIONS_URL) {
          return new Response("null", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected ${url}`);
      });
      const deepinfra = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { objects: objectStorage, exerciseMediaImages: deepinfra },
      );
      const response = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/generate`,
          deps,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          },
        ),
        deps,
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: "image_generation_response_invalid",
      });
    } finally {
      storage.close();
    }
  });

  for (const body of ["{}", JSON.stringify({ data: [] })]) {
    it(`missing image field through route: 502 image_generation_response_invalid for ${body}`, async () => {
      const storage = await openMigratedDatabase();
      try {
        const { practitionerId, versionId, objectStorage } =
          await seedDraftVersion(storage);
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === "string" ? input : input.toString();
          if (url === GENERATIONS_URL) {
            return new Response(body, {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          throw new Error(`unexpected ${url}`);
        });
        const deepinfra = new DeepInfraFluxKleinImageGeneration({ apiKey, fetchImpl });
        const deps = exerciseMediaTestDeps(
          storage,
          {
            practitionerId,
            email: "coach@example.com",
            displayName: "Coach",
          },
          { objects: objectStorage, exerciseMediaImages: deepinfra },
        );
        const response = await handleRequest(
          mediaRequest(
            `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/generate`,
            deps,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({}),
            },
          ),
          deps,
        );
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toEqual({
          error: "image_generation_response_invalid",
        });
      } finally {
        storage.close();
      }
    });
  }
});
