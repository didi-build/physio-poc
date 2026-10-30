import { describe, expect, it, vi } from "vitest";
import {
  FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID,
  FAL_FLUX_KLEIN_4B_MODEL_ID,
  FalFluxKleinImageGeneration,
} from "../src/adapters/node/fal-flux-klein-image-generation.js";
import { handleRequest } from "../src/http/app.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import {
  exerciseMediaSessionCookie,
  exerciseMediaTestDeps,
} from "./helpers/exercise-media-http.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  assertLeakFreeText,
  expectConsoleCallsLeakFree,
  expectThrownErrorLeakFree,
  restoreConsoleSpies,
  spyAllConsoleLevels,
} from "./helpers/console-log-leak-assertions.js";
import {
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const REGEN_NOTE = 'deeper "range"\nhold steady';
const FAL_API_KEY = "fal-test-key-must-not-appear-in-errors";
const END_EDIT_OUTPUT_URL = "https://v3b.fal.media/files/test/end-regen-out.png";

async function seedDraftVersionWithGeneratedMedia(
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
    () => testOpaqueEntityId(`media-bootstrap-${tick}`),
  );
  await bootstrap.generateInitialMediaForVersion({
    exerciseVersionId: FIXTURE_VERSION_ID,
  });
  const row = await storage.first<{ start_provider_url: string | null }>(
    "SELECT start_provider_url FROM exercise_media_sets ORDER BY created_at DESC LIMIT 1",
  );
  const startProviderUrl = row?.start_provider_url;
  expect(startProviderUrl).toMatch(/^https:\/\/v3b\.fal\.media\//);
  return {
    practitionerId,
    exerciseId,
    versionId: FIXTURE_VERSION_ID,
    startProviderUrl: startProviderUrl as string,
    objects: media,
    objectStorage,
  };
}

function mediaHttpDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  objects: InMemoryObjectStorage,
) {
  return exerciseMediaTestDeps(
    storage,
    {
      practitionerId,
      email: "coach@example.com",
      displayName: "Coach",
    },
    { objects },
  );
}

function mediaRequest(
  url: string,
  deps: ReturnType<typeof mediaHttpDeps>,
  init: RequestInit = {},
) {
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", exerciseMediaSessionCookie(deps));
  return new Request(url, { ...withCsrf, headers });
}

function createEndOnlyRegenFetchMock(startProviderUrl: string) {
  let textToImageCalls = 0;
  let editCalls = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith(`/${FAL_FLUX_KLEIN_4B_MODEL_ID}`)) {
      textToImageCalls += 1;
      throw new Error("text-to-image must not run on end-only regeneration");
    }
    if (url.endsWith(`/${FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID}`)) {
      editCalls += 1;
      const body = JSON.parse(String(init?.body)) as { image_urls?: string[] };
      expect(body.image_urls).toEqual([startProviderUrl]);
      return new Response(JSON.stringify({ images: [{ url: END_EDIT_OUTPUT_URL }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });
  return {
    fetchImpl,
    textToImageCalls: () => textToImageCalls,
    editCalls: () => editCalls,
  };
}

describe("Exercise media QA round 3 (integration, mocked fal)", () => {
  it("end-only regeneration calls klein edit once with the stored start URL and never text-to-image", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId, startProviderUrl, objects } =
        await seedDraftVersionWithGeneratedMedia(storage);
      const { fetchImpl, textToImageCalls, editCalls } =
        createEndOnlyRegenFetchMock(startProviderUrl);
      const fal = new FalFluxKleinImageGeneration({ apiKey: FAL_API_KEY, fetchImpl });
      const service = new ExerciseMediaService(storage, fal, objects);
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "end",
        note: REGEN_NOTE,
      });
      expect(textToImageCalls()).toBe(0);
      expect(editCalls()).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("end-only regeneration via HTTP exerciseMediaImages route uses one edit call and no text-to-image", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId, startProviderUrl, objectStorage } =
        await seedDraftVersionWithGeneratedMedia(storage);
      const { fetchImpl, textToImageCalls, editCalls } =
        createEndOnlyRegenFetchMock(startProviderUrl);
      const fal = new FalFluxKleinImageGeneration({ apiKey: FAL_API_KEY, fetchImpl });
      const response = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
          mediaHttpDeps(storage, practitionerId, objectStorage),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end", note: REGEN_NOTE }),
          },
        ),
        {
          ...mediaHttpDeps(storage, practitionerId, objectStorage),
          exerciseMediaImages: fal,
        },
      );
      expect(response.status).toBe(200);
      expect(textToImageCalls()).toBe(0);
      expect(editCalls()).toBe(1);
      const requestUrls = fetchImpl.mock.calls.map((call) => String(call[0]));
      expect(
        requestUrls.filter((url) => url.endsWith(`/${FAL_FLUX_KLEIN_4B_MODEL_ID}`)),
      ).toEqual([]);
      expect(
        requestUrls.filter((url) =>
          url.endsWith(`/${FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID}`),
        ),
      ).toHaveLength(1);
    } finally {
      storage.close();
    }
  });

  it("does not leak the regeneration note when klein edit returns 401", async () => {
    const storage = await openMigratedDatabase();
    const jsonBody = JSON.stringify({ detail: REGEN_NOTE, echo: REGEN_NOTE });
    const consoleSpies = spyAllConsoleLevels();
    try {
      const { practitionerId, versionId, objects, objectStorage } =
        await seedDraftVersionWithGeneratedMedia(storage);
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith(`/${FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID}`)) {
          return new Response(jsonBody, { status: 401 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      const fal = new FalFluxKleinImageGeneration({ apiKey: FAL_API_KEY, fetchImpl });
      const service = new ExerciseMediaService(storage, fal, objects);
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "end",
          note: REGEN_NOTE,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expectThrownErrorLeakFree(err, {
          note: REGEN_NOTE,
          jsonBody,
          apiKey: FAL_API_KEY,
        });
        console.error(err);
        return true;
      });
      expectConsoleCallsLeakFree(consoleSpies, {
        note: REGEN_NOTE,
        jsonBody,
        apiKey: FAL_API_KEY,
      });

      const httpResponse = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
          mediaHttpDeps(storage, practitionerId, objectStorage),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end", note: REGEN_NOTE }),
          },
        ),
        {
          ...mediaHttpDeps(storage, practitionerId, objectStorage),
          exerciseMediaImages: fal,
        },
      );
      expect(httpResponse.status).toBe(502);
      const responseText = await httpResponse.text();
      assertLeakFreeText(responseText, {
        note: REGEN_NOTE,
        jsonBody,
        apiKey: FAL_API_KEY,
      });
      expect(responseText).toContain("fal_api_request_failed");
    } finally {
      restoreConsoleSpies(consoleSpies);
      storage.close();
    }
  });

  it("does not leak the regeneration note when fal image download returns 500", async () => {
    const storage = await openMigratedDatabase();
    const jsonBody = JSON.stringify({ detail: REGEN_NOTE });
    const consoleSpies = spyAllConsoleLevels();
    try {
      const { practitionerId, versionId, objects } =
        await seedDraftVersionWithGeneratedMedia(storage);
      const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith(`/${FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID}`)) {
          return new Response(
            JSON.stringify({ images: [{ url: END_EDIT_OUTPUT_URL }] }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (url === END_EDIT_OUTPUT_URL) {
          expect(init?.redirect).toBe("manual");
          return new Response(jsonBody, { status: 500 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      const fal = new FalFluxKleinImageGeneration({ apiKey: FAL_API_KEY, fetchImpl });
      const service = new ExerciseMediaService(storage, fal, objects);
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "end",
          note: REGEN_NOTE,
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toMatchObject({
          code: "fal_image_download_failed",
          statusCode: 500,
        });
        expectThrownErrorLeakFree(err, {
          note: REGEN_NOTE,
          jsonBody,
          apiKey: FAL_API_KEY,
        });
        console.error(err);
        return true;
      });
      expectConsoleCallsLeakFree(consoleSpies, {
        note: REGEN_NOTE,
        jsonBody,
        apiKey: FAL_API_KEY,
      });
    } finally {
      restoreConsoleSpies(consoleSpies);
      storage.close();
    }
  });
});
