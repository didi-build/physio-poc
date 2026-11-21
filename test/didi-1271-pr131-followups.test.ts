import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES } from "../src/adapters/deepinfra/exercise-draft-ai-config.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import {
  EXERCISE_DRAFT_AI_JSON_SCHEMA,
  parseAndValidateExerciseDraftAiPayload,
} from "../src/adapters/deepinfra/exercise-draft-ai-schema.js";
import {
  DeepInfraChatCompletionClient,
  readHttpResponseTextWithByteCap,
} from "../src/adapters/deepinfra/deepinfra-chat-completion-client.js";
import { openAiJsonSchemaResponseFormat } from "../src/adapters/deepinfra/exercise-draft-ai-schema.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { createWorkerProductionAppDependencies } from "../src/adapters/workers/create-worker-production-app-dependencies.js";
import { resetWorkerFakeDeepinfraProviderLogForTests } from "../src/adapters/workers/worker-fake-deepinfra-provider-log.js";
import { resetWorkerProductionAuthCacheForTests } from "../src/adapters/workers/create-app-dependencies.js";
import { buildWorkerProductionAuthEnv } from "./helpers/worker-production-auth-test-utils.js";
import { openWorkerAuthTestDatabase } from "./helpers/worker-auth-d1-fixture.js";
import { createFakeR2Bucket } from "./helpers/fake-r2-bucket.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { DeepInfraFluxKleinImageGeneration } from "../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";

const SENTINEL_DEEPINFRA_KEY = "fixture-sentinel-deepinfra-key-never-log";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const AFTER_FORM = "2026-10-30T11:00:00.000Z";

const VALID_STRETCH_DRAFT = {
  title: "Heel slide",
  aliases: ["Heel slides"],
  category: "stretch",
  body_regions: ["knee"],
  description: "Gentle knee flexion stretch.",
  equipment: "Mat",
  starting_position: "Supine on mat.",
  steps: "1. Bend knee\n2. Slide heel",
  common_mistakes: "Rushing",
  regressions: "Smaller range",
  progressions: "Hold longer",
  precautions: "Stop if pain",
  cue_stretching: "Move slowly",
  cue_isometric: null,
  cue_concentric: null,
  cue_eccentric: null,
} as const;

function envelope(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("DIDI-1271 PR131 follow-ups (QA R3 survivors)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("L07: trims exercise note whitespace in the user prompt Note line", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: "k",
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-l07"),
        "l07@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await service.submitRequest({
        practitionerId: practitioner,
        requestedName: "Heel slide",
        exerciseNote: "  rehab version  ",
        formOpenedAt: FORM_OPENED,
      });
      const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
      const messages = (
        JSON.parse(String(init.body)) as { messages: { content: string }[] }
      ).messages;
      expect(messages[1]?.content).toBe(
        "Exercise name: Heel slide\nNote: rehab version",
      );
    } finally {
      storage.close();
    }
  });

  it("returns an empty string when the HTTP response body is null", async () => {
    const text = await readHttpResponseTextWithByteCap(
      new Response(null, { status: 204 }),
      1024,
    );
    expect(text).toBe("");
  });

  it("Z01: accepts HTTP responses when content-length equals the byte cap", async () => {
    const payload = "{}";
    const text = await readHttpResponseTextWithByteCap(
      new Response(payload, {
        status: 200,
        headers: {
          "content-length": String(DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES),
        },
      }),
      DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES,
    );
    expect(text).toBe(payload);
  });

  it("U07: migration 0012 rejects suggested body region labels longer than 80 characters", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-u07"),
        "u07@example.com",
      );
      const exerciseId = await seedExercise(storage, practitioner, id("ex-u07"));
      const label81 = "a".repeat(81);
      await expect(
        storage.run(
          "INSERT INTO exercise_suggested_body_regions (exercise_id, label) VALUES (?, ?)",
          [exerciseId, label81],
        ),
      ).rejects.toThrow(/CHECK constraint failed/);
    } finally {
      storage.close();
    }
  });

  it("U08b: rejects body_regions schema items longer than 80 characters", () => {
    const overlong = { ...VALID_STRETCH_DRAFT, body_regions: ["x".repeat(81)] };
    expect(parseAndValidateExerciseDraftAiPayload(overlong)).toBeNull();
  });

  it("U08b: pins body_regions item maxLength at 80 in the provider JSON schema", () => {
    const bodyRegions = EXERCISE_DRAFT_AI_JSON_SCHEMA.properties.body_regions as {
      items: { maxLength: number };
    };
    expect(bodyRegions.items.maxLength).toBe(80);
  });

  it("T02: aborts the upstream request when the timeout elapses (fake timers)", async () => {
    vi.useFakeTimers();
    let abortSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          abortSignal = init?.signal ?? undefined;
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    );
    const client = new DeepInfraChatCompletionClient({
      apiKey: "k",
      fetchImpl,
      timeoutMs: 50,
    });
    const inflight = client.complete({
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      messages: [{ role: "user", content: "Exercise name: Heel slide\nNote: None" }],
      response_format: openAiJsonSchemaResponseFormat(),
    });
    inflight.catch(() => {});
    await vi.advanceTimersByTimeAsync(50);
    expect(abortSignal?.aborted).toBe(true);
    await expect(inflight).rejects.toMatchObject({
      code: "deepinfra_exercise_draft_timeout",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("Z02: resolves draft generation when the streamed JSON body length equals the cap", async () => {
    const contentJson = JSON.stringify(VALID_STRETCH_DRAFT);
    const envelopeJson = JSON.stringify({
      choices: [{ message: { content: contentJson } }],
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(envelopeJson));
        controller.close();
      },
    });
    const fetchImpl = vi.fn(
      async () =>
        new Response(stream, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: "k",
      fetchImpl,
      responseMaxBytes: envelopeJson.length,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-z02"),
        "z02@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expect(
        service.submitRequest({
          practitionerId: practitioner,
          requestedName: "Heel slide",
          formOpenedAt: FORM_OPENED,
        }),
      ).resolves.toBeDefined();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });
});

describe("DIDI-1271 fake DeepInfra provider warning (production Worker)", () => {
  beforeEach(() => {
    resetWorkerFakeDeepinfraProviderLogForTests();
    resetWorkerProductionAuthCacheForTests();
  });

  afterEach(() => {
    resetWorkerFakeDeepinfraProviderLogForTests();
    resetWorkerProductionAuthCacheForTests();
  });

  it("logs one structured warning per isolate when PHYSIO_DEEPINFRA_API_KEY is missing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      createWorkerProductionAppDependencies(env);
      createWorkerProductionAppDependencies(env);
      const warningLogs = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line) =>
          String(line).includes("physio_worker_fake_deepinfra_provider"),
        );
      expect(warningLogs).toHaveLength(1);
      const parsed = JSON.parse(String(warningLogs[0])) as {
        event: string;
        missing_secret_name: string;
      };
      expect(parsed).toEqual({
        event: "physio_worker_fake_deepinfra_provider",
        missing_secret_name: "PHYSIO_DEEPINFRA_API_KEY",
      });
      for (const line of logSpy.mock.calls.map((call) => String(call[0]))) {
        expect(line).not.toContain(SENTINEL_DEEPINFRA_KEY);
      }
    } finally {
      logSpy.mockRestore();
      storage.close();
    }
  });

  it("does not log the warning when PHYSIO_DEEPINFRA_API_KEY is set", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
        PHYSIO_DEEPINFRA_API_KEY: SENTINEL_DEEPINFRA_KEY,
      });
      createWorkerProductionAppDependencies(env);
      const warningLogs = logSpy.mock.calls.filter((call) =>
        String(call[0]).includes("physio_worker_fake_deepinfra_provider"),
      );
      expect(warningLogs).toHaveLength(0);
      for (const line of logSpy.mock.calls.map((call) => String(call[0]))) {
        expect(line).not.toContain(SENTINEL_DEEPINFRA_KEY);
      }
    } finally {
      logSpy.mockRestore();
      storage.close();
    }
  });

  it("logs one warning and uses fake providers when PHYSIO_DEEPINFRA_API_KEY is blank whitespace", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const deps = createWorkerProductionAppDependencies(
        buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: createFakeR2Bucket(),
          PHYSIO_DEEPINFRA_API_KEY: "   ",
        }),
      );
      const warningLogs = logSpy.mock.calls
        .map((call) => call[0])
        .filter((line) =>
          String(line).includes("physio_worker_fake_deepinfra_provider"),
        );
      expect(warningLogs).toHaveLength(1);
      expect(JSON.parse(String(warningLogs[0]))).toEqual({
        event: "physio_worker_fake_deepinfra_provider",
        missing_secret_name: "PHYSIO_DEEPINFRA_API_KEY",
      });
      expect(deps.exerciseDraftGenerator).toBe(fakeExerciseDraftGenerator);
      expect(deps.exerciseMediaImages).toBeInstanceOf(FakeImageGeneration);
      expect(deps.exerciseMediaImages).not.toBeInstanceOf(
        DeepInfraFluxKleinImageGeneration,
      );
    } finally {
      logSpy.mockRestore();
      storage.close();
    }
  });

  it("selects fake text and image providers when the production key is absent", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const deps = createWorkerProductionAppDependencies(
        buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: createFakeR2Bucket(),
        }),
      );
      expect(deps.exerciseDraftGenerator).toBe(fakeExerciseDraftGenerator);
      expect(deps.exerciseMediaImages).toBeInstanceOf(FakeImageGeneration);
    } finally {
      storage.close();
    }
  });
});
