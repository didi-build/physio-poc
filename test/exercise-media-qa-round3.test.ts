import { describe, expect, it, vi } from "vitest";
import { DeepInfraFluxKleinImageGeneration } from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
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
const DEEPINFRA_API_KEY = "deepinfra-sentinel-key-must-not-appear-in-errors";

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
    practitionerId,
    exerciseVersionId: FIXTURE_VERSION_ID,
  });
  const row = await storage.first<{ start_provider_url: string | null }>(
    "SELECT start_provider_url FROM exercise_media_sets ORDER BY created_at DESC LIMIT 1",
  );
  expect(row?.start_provider_url).toBeNull();
  return {
    practitionerId,
    exerciseId,
    versionId: FIXTURE_VERSION_ID,
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

function b64Png(label: string): string {
  return btoa(label);
}

function createEndOnlyRegenFetchMock() {
  let generationCalls = 0;
  let editCalls = 0;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/v1/openai/images/generations")) {
      generationCalls += 1;
      throw new Error("generations must not run on end-only regeneration");
    }
    if (url.endsWith("/v1/images/edits")) {
      editCalls += 1;
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("image")).toBeInstanceOf(Blob);
      return new Response(
        JSON.stringify({ data: [{ b64_json: b64Png("end-edit") }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return {
    fetchImpl,
    generationCalls: () => generationCalls,
    editCalls: () => editCalls,
  };
}

describe("Exercise media QA round 3 (integration, mocked DeepInfra)", () => {
  it("end-only regeneration calls image edits once from stored start bytes and never text-to-image", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId, objects } =
        await seedDraftVersionWithGeneratedMedia(storage);
      const { fetchImpl, generationCalls, editCalls } = createEndOnlyRegenFetchMock();
      const deepinfra = new DeepInfraFluxKleinImageGeneration({
        apiKey: DEEPINFRA_API_KEY,
        fetchImpl,
      });
      const service = new ExerciseMediaService(storage, deepinfra, objects);
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "end",
        note: REGEN_NOTE,
      });
      expect(generationCalls()).toBe(0);
      expect(editCalls()).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("end-only regeneration via HTTP exerciseMediaImages route uses one edit call and no generations", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId, objectStorage } =
        await seedDraftVersionWithGeneratedMedia(storage);
      const { fetchImpl, generationCalls, editCalls } = createEndOnlyRegenFetchMock();
      const deepinfra = new DeepInfraFluxKleinImageGeneration({
        apiKey: DEEPINFRA_API_KEY,
        fetchImpl,
      });
      const response = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/regenerate`,
          mediaHttpDeps(storage, practitionerId, objectStorage),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end", note: REGEN_NOTE }),
          },
        ),
        {
          ...mediaHttpDeps(storage, practitionerId, objectStorage),
          exerciseMediaImages: deepinfra,
        },
      );
      expect(response.status).toBe(200);
      expect(generationCalls()).toBe(0);
      expect(editCalls()).toBe(1);
      const requestUrls = fetchImpl.mock.calls.map((call) => String(call[0]));
      expect(
        requestUrls.filter((url) => url.endsWith("/v1/openai/images/generations")),
      ).toEqual([]);
      expect(
        requestUrls.filter((url) => url.endsWith("/v1/images/edits")),
      ).toHaveLength(1);
    } finally {
      storage.close();
    }
  });

  it("does not leak the regeneration note when DeepInfra edit returns 401", async () => {
    const storage = await openMigratedDatabase();
    const jsonBody = JSON.stringify({ detail: REGEN_NOTE, echo: REGEN_NOTE });
    const consoleSpies = spyAllConsoleLevels();
    try {
      const { practitionerId, versionId, objects, objectStorage } =
        await seedDraftVersionWithGeneratedMedia(storage);
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/v1/images/edits")) {
          return new Response(jsonBody, { status: 401 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      });
      const deepinfra = new DeepInfraFluxKleinImageGeneration({
        apiKey: DEEPINFRA_API_KEY,
        fetchImpl,
      });
      const service = new ExerciseMediaService(storage, deepinfra, objects);
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
          apiKey: DEEPINFRA_API_KEY,
        });
        console.error(err);
        return true;
      });
      expectConsoleCallsLeakFree(consoleSpies, {
        note: REGEN_NOTE,
        jsonBody,
        apiKey: DEEPINFRA_API_KEY,
      });

      const httpResponse = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/regenerate`,
          mediaHttpDeps(storage, practitionerId, objectStorage),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end", note: REGEN_NOTE }),
          },
        ),
        {
          ...mediaHttpDeps(storage, practitionerId, objectStorage),
          exerciseMediaImages: deepinfra,
        },
      );
      expect(httpResponse.status).toBe(401);
      const responseText = await httpResponse.text();
      assertLeakFreeText(responseText, {
        note: REGEN_NOTE,
        jsonBody,
        apiKey: DEEPINFRA_API_KEY,
      });
      expect(responseText).toContain("image_generation_request_failed");
    } finally {
      restoreConsoleSpies(consoleSpies);
      storage.close();
    }
  });
});
