import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import {
  DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES,
  DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL,
  DEFAULT_DEEPINFRA_EXERCISE_DRAFT_MODEL_ID,
} from "../src/adapters/deepinfra/exercise-draft-ai-config.js";
import {
  PINNED_EXERCISE_DRAFT_JSON_SCHEMA,
  PINNED_EXERCISE_DRAFT_RESPONSE_FORMAT,
  PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT,
} from "./fixtures/pinned-deepinfra-exercise-draft-literals.js";
import { readHttpResponseTextWithByteCap } from "../src/adapters/deepinfra/deepinfra-chat-completion-client.js";
import { resolveExerciseDraftGenerator } from "../src/adapters/deepinfra/resolve-exercise-draft-generator.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  ExerciseAliasesRepository,
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../src/storage/repositories/exercise-data.js";
import {
  expectThrownErrorLeakFree,
  restoreConsoleSpies,
  spyAllConsoleLevels,
} from "./helpers/console-log-leak-assertions.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedExercise,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import type { ExerciseDraftGenerator } from "../src/services/exercise-requests/exercise-draft-generator-types.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  submitRequestWithGeneratedDraft,
  testExerciseMediaService,
} from "./helpers/exercise-requests-generate-fixture.js";
import { serviceGenerateRequestWithDrain } from "./helpers/test-draft-generation-workflow-port.js";
import { MAX_LENGTH_EXERCISE_TEMPLATE_TEXT } from "../src/mcp-connector/text-limits.js";
import { id } from "./helpers/opaque-test-ids.js";
import { stubThisSensitiveGlobalFetch } from "./helpers/this-sensitive-global-fetch.js";

const SENTINEL_KEY = "deepinfra-sentinel-key-must-not-appear";
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
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function requestBodyFromCall(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

async function expectGenerateTextFailure(
  service: ExerciseRequestsService,
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  input: Parameters<ExerciseRequestsService["submitRequest"]>[0],
  expectedCode: string,
  draftGenerator: ExerciseDraftGenerator,
): Promise<string> {
  const created = await service.submitRequest(input);
  expect(created.outcome).toBe("created");
  if (created.outcome !== "created") {
    throw new Error("expected created request");
  }
  const generated = await serviceGenerateRequestWithDrain(service, storage, {
    practitionerId: input.practitionerId,
    requestId: created.request_id,
    mediaService: testExerciseMediaService(storage),
    draftGenerator,
  });
  expect(generated).toMatchObject({ outcome: "text_failed", error: expectedCode });
  return created.request_id;
}

async function expectGenerateRejects(
  service: ExerciseRequestsService,
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  input: Parameters<ExerciseRequestsService["submitRequest"]>[0],
  draftGenerator: ExerciseDraftGenerator,
  matcher: (
    result: Awaited<ReturnType<ExerciseRequestsService["generateRequest"]>>,
  ) => boolean,
): Promise<void> {
  const created = await service.submitRequest(input);
  expect(created.outcome).toBe("created");
  if (created.outcome !== "created") {
    throw new Error("expected created request");
  }
  const generated = await serviceGenerateRequestWithDrain(service, storage, {
    practitionerId: input.practitionerId,
    requestId: created.request_id,
    mediaService: testExerciseMediaService(storage),
    draftGenerator,
  });
  expect(matcher(generated)).toBe(true);
}

async function runGenerator(
  generator: ExerciseDraftGenerator,
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  input: Parameters<ExerciseDraftGenerator>[0],
  deps: Parameters<ExerciseDraftGenerator>[1],
): Promise<ReturnType<ExerciseDraftGenerator>> {
  await seedDraftingExerciseRequest(storage, {
    requestId: input.requestId,
    practitionerId: input.requestedBy,
    requestedName: input.requestedName,
    note: input.exerciseNote,
  });
  return generator(input, deps);
}

describe("DeepInfra exercise draft generator", () => {
  it("pins the chat completions URL and request body literals (name and note only in user message)", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: "test-key",
      modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    const practitioner = await seedPractitioner(
      storage,
      id("pr-deep"),
      "deep@example.com",
    );
    try {
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-deep-prompt"),
          requestedName: "Heel slide",
          exerciseNote: "rehab version",
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const call = fetchImpl.mock.calls[0] as unknown as
        [string, RequestInit?] | undefined;
      expect(call).toBeDefined();
      const [url, init] = call!;
      expect(url).toBe("https://api.deepinfra.com/v1/openai/chat/completions");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-key");
      expect(headers["Content-Type"]).toBe("application/json");
      const body = requestBodyFromCall(init);
      expect(body).toEqual({
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        messages: [
          { role: "system", content: PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT },
          {
            role: "user",
            content: "Exercise name: Heel slide\nNote: rehab version",
          },
        ],
        response_format: PINNED_EXERCISE_DRAFT_RESPONSE_FORMAT,
      });
    } finally {
      storage.close();
    }
  });

  it("stores a full draft after a valid model response", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = createDeepInfraExerciseDraftGenerator({ apiKey: "k", fetchImpl });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-draft"),
        "d@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      const created = await submitRequestWithGeneratedDraft(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Heel slide",
          exerciseNote: null,
          formOpenedAt: FORM_OPENED,
        },
        { draftGenerator: generator },
      );
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created outcome");
      }
      const requestRow = await storage.first<{ exercise_id: string }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      if (!requestRow?.exercise_id) {
        throw new Error("expected exercise_id after generate");
      }
      const exerciseId = requestRow.exercise_id;
      const version = await storage.first<{ status: string; title: string }>(
        "SELECT status, title FROM exercise_versions WHERE exercise_id = ?",
        [exerciseId],
      );
      expect(version?.status).toBe("draft");
      expect(version?.title).toBe("Heel slide");
      const description = await storage.first<{ description: string }>(
        "SELECT description FROM exercise_versions WHERE exercise_id = ?",
        [exerciseId],
      );
      expect(description?.description).toBe("Gentle knee flexion stretch.");
      expect(description?.description).not.toContain("Default sets and reps");
    } finally {
      storage.close();
    }
  });

  it("retries once on invalid JSON then fails without storing a draft", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(envelope("not-json{{{"))
      .mockResolvedValueOnce(envelope("still-not-json"));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-bad-json"),
        "j@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expectGenerateTextFailure(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Bad json move",
          formOpenedAt: FORM_OPENED,
        },
        "deepinfra_exercise_draft_response_invalid",
        generator,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const count = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercise_requests WHERE requested_name = ?",
        ["Bad json move"],
      );
      expect(count?.count).toBe(1);
      const exercises = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercises",
      );
      expect(exercises?.count).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("rejects email-shaped aliases at persist without writing rows", async () => {
    const emailAlias = { ...VALID_STRETCH_DRAFT, aliases: ["jane@example.com"] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(envelope(JSON.stringify(emailAlias)))
      .mockResolvedValueOnce(envelope(JSON.stringify(emailAlias)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-email-alias"),
        "email-alias@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        runGenerator(
          generator,
          storage,
          {
            sql: storage,
            requestId: id("req-email-alias"),
            requestedName: "Heel slide",
            exerciseNote: null,
            requestedBy: practitioner,
            now: AFTER_FORM,
            providerAttempts: 2,
          },
          {
            exercises: new ExercisesRepository(storage),
            versions,
            requests,
          },
        ),
      ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_response_invalid" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const aliasRows = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercise_aliases WHERE alias LIKE '%@%'",
      );
      expect(aliasRows?.count).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("Regenerate text permanent 503 makes exactly 2 fetches (R5)", async () => {
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-regen-503"),
        "regen503@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const created = await submitRequestWithGeneratedDraft(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Regen 503",
          exerciseNote: null,
          formOpenedAt: FORM_OPENED,
        },
        { draftGenerator: fakeExerciseDraftGenerator },
      );
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created");
      }
      const regenService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      const result = await regenService.regenerateDraftText({
        practitionerId: practitioner,
        requestId: created.request_id,
        note: "please retry",
      });
      expect(result).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      storage.close();
    }
  });

  it("retries once when a schema-valid alias clashes with the library", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-alias-clash"),
        "alias-clash@example.com",
      );
      const existingExerciseId = id("ex-alias-clash");
      await seedExercise(storage, practitioner, existingExerciseId);
      const aliases = new ExerciseAliasesRepository(storage);
      await aliases.insert({
        id: id("alias-clash"),
        exerciseId: existingExerciseId,
        alias: "Heel slides",
        createdAt: AFTER_FORM,
      });
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        runGenerator(
          generator,
          storage,
          {
            sql: storage,
            requestId: id("req-alias-clash"),
            requestedName: "Heel slide clash",
            exerciseNote: null,
            requestedBy: practitioner,
            now: AFTER_FORM,
            providerAttempts: 2,
          },
          {
            exercises: new ExercisesRepository(storage),
            versions,
            requests,
          },
        ),
      ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_response_invalid" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      storage.close();
    }
  });

  it("retries once when repository validation fails after a schema-valid payload", async () => {
    const tooLong = "x".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1);
    const overLimit = { ...VALID_STRETCH_DRAFT, description: tooLong };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(envelope(JSON.stringify(overLimit)))
      .mockResolvedValueOnce(envelope(JSON.stringify(overLimit)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-domain"),
        "d@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expectGenerateTextFailure(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Domain validation fail",
          formOpenedAt: FORM_OPENED,
        },
        "deepinfra_exercise_draft_response_invalid",
        generator,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });

  it("retries once on schema miss then fails cleanly", async () => {
    const invalid = { ...VALID_STRETCH_DRAFT, cue_stretching: null };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(envelope(JSON.stringify(invalid)))
      .mockResolvedValueOnce(envelope(JSON.stringify(invalid)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-schema"),
        "s@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expectGenerateTextFailure(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Schema miss",
          formOpenedAt: FORM_OPENED,
        },
        "deepinfra_exercise_draft_response_invalid",
        generator,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });

  it("maps HTTP 500 to typed request_failed without a second in-provider fetch", async () => {
    const echo = JSON.stringify({ error: "Authorization Bearer " + SENTINEL_KEY });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(echo, { status: 500 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    const spies = spyAllConsoleLevels();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-http"),
        "h@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expectGenerateRejects(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Http fail",
          formOpenedAt: FORM_OPENED,
        },
        generator,
        (result) => {
          expect(result.outcome).toBe("text_failed");
          if (result.outcome !== "text_failed") {
            return false;
          }
          expect(result.error).toBe("deepinfra_exercise_draft_request_failed");
          return true;
        },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      restoreConsoleSpies(spies);
      storage.close();
    }
  });

  it.each([400, 404, 422, 402, 403, 429] as const)(
    "does not retry on HTTP %i",
    async (status) => {
      const fetchImpl = vi.fn(async () => new Response("{}", { status }));
      const generator = createDeepInfraExerciseDraftGenerator({
        apiKey: SENTINEL_KEY,
        fetchImpl,
      });
      const storage = await openMigratedDatabase();
      try {
        const practitioner = await seedPractitioner(
          storage,
          id(`pr-${status}`),
          `${status}@example.com`,
        );
        const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
          draftGenerator: generator,
        });
        await expectGenerateRejects(
          service,
          storage,
          {
            practitionerId: practitioner,
            requestedName: `No retry ${status}`,
            formOpenedAt: FORM_OPENED,
          },
          generator,
          (result) => {
            expect(result).toMatchObject({
              outcome: "text_failed",
              error: "deepinfra_exercise_draft_request_failed",
            });
            return true;
          },
        );
        expect(fetchImpl).toHaveBeenCalledTimes(1);
      } finally {
        storage.close();
      }
    },
  );

  it("does not retry on HTTP 401", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-401"),
        "a@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expectGenerateRejects(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Auth fail",
          formOpenedAt: FORM_OPENED,
        },
        generator,
        (result) => {
          expect(result).toMatchObject({
            outcome: "text_failed",
            error: "deepinfra_exercise_draft_request_failed",
          });
          return true;
        },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });

  it("maps timeout to typed failure without raw AbortError", async () => {
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
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
      timeoutMs: 25,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-timeout"),
        "t@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      const created = await service.submitRequest({
        practitionerId: practitioner,
        requestedName: "Timeout",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created request");
      }
      const inflight = serviceGenerateRequestWithDrain(service, storage, {
        practitionerId: practitioner,
        requestId: created.request_id,
        mediaService: testExerciseMediaService(storage),
        draftGenerator: generator,
      });
      inflight.catch(() => {});
      await vi.advanceTimersByTimeAsync(25);
      await vi.advanceTimersByTimeAsync(25);
      expect(abortSignal?.aborted).toBe(true);
      const generated = await inflight;
      expect(generated).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_timeout",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      storage.close();
    }
  });

  it("maps generate timeout to text_failed without raw AbortError", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }),
    );
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
      timeoutMs: 25,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-timeout-generate"),
        "tg@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      const created = await service.submitRequest({
        practitionerId: practitioner,
        requestedName: "Timeout generate",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created request");
      }
      const inflight = serviceGenerateRequestWithDrain(service, storage, {
        practitionerId: practitioner,
        requestId: created.request_id,
        mediaService: testExerciseMediaService(storage),
        draftGenerator: generator,
      });
      await vi.advanceTimersByTimeAsync(25);
      await vi.advanceTimersByTimeAsync(25);
      expect(await inflight).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_timeout",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      storage.close();
    }
  });

  it("maps network errors to typed failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-net"),
        "n@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expectGenerateRejects(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Network",
          formOpenedAt: FORM_OPENED,
        },
        generator,
        (result) => {
          expect(result).toMatchObject({
            outcome: "text_failed",
            error: "deepinfra_exercise_draft_network_error",
          });
          return true;
        },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });

  it("uses PHYSIO_DEEPINFRA_EXERCISE_DRAFT_MODEL override in the provider request", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = resolveExerciseDraftGenerator({
      PHYSIO_DEEPINFRA_API_KEY: "k",
      PHYSIO_DEEPINFRA_EXERCISE_DRAFT_MODEL: "custom-model/from-env",
    });
    vi.stubGlobal("fetch", fetchImpl);
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-model-override"),
        "model@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-model-override"),
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      const body = requestBodyFromCall(
        (fetchImpl.mock.calls[0] as unknown as [string, RequestInit?])[1],
      );
      expect(body.model).toBe("custom-model/from-env");
    } finally {
      vi.unstubAllGlobals();
      storage.close();
    }
  });

  it("trims whitespace from the API key before Authorization", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = resolveExerciseDraftGenerator({
      PHYSIO_DEEPINFRA_API_KEY: "  trimmed-key  ",
    });
    vi.stubGlobal("fetch", fetchImpl);
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-trim-key"),
        "trim@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-trim-key"),
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit?])[1];
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer trimmed-key");
    } finally {
      vi.unstubAllGlobals();
      storage.close();
    }
  });

  it("retries once without persisting when template text includes patient details", async () => {
    const draftWithTemplatePii = {
      ...VALID_STRETCH_DRAFT,
      steps: "Jane Smith DOB 1990-01-02 — slide heel",
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(envelope(JSON.stringify(draftWithTemplatePii)))
      .mockResolvedValueOnce(envelope(JSON.stringify(draftWithTemplatePii)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-template-pii"),
        "tpii@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: generator,
      });
      await expectGenerateTextFailure(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Template PII",
          formOpenedAt: FORM_OPENED,
        },
        "deepinfra_exercise_draft_response_invalid",
        generator,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const requestCount = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercise_requests WHERE requested_name = ?",
        ["Template PII"],
      );
      expect(requestCount?.count).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("rejects responses whose content-length exceeds the cap before streaming", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: {
            "content-length": String(DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES + 1),
          },
        }),
    );
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-cl"),
        "cl@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        runGenerator(
          generator,
          storage,
          {
            sql: storage,
            requestId: id("req-cl"),
            requestedName: "Cap",
            exerciseNote: null,
            requestedBy: practitioner,
            now: AFTER_FORM,
          },
          {
            exercises: new ExercisesRepository(storage),
            versions,
            requests,
          },
        ),
      ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_response_too_large" });
    } finally {
      storage.close();
    }
  });

  it("maps stream read abort to typed timeout", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
      pull() {
        return Promise.reject(
          new DOMException("The operation was aborted", "AbortError"),
        );
      },
    });
    await expect(
      readHttpResponseTextWithByteCap(
        new Response(stream, { status: 200 }),
        DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES,
      ),
    ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_timeout" });
  });

  it("stores normalized suggestion labels for case and whitespace variants", async () => {
    const draftWithVariants = {
      ...VALID_STRETCH_DRAFT,
      body_regions: ["knee", "Upper back", "upper back", "upper   back"],
    };
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(draftWithVariants)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-norm-suggest"),
        "norm@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      const result = await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-norm-suggest"),
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      const suggested = await storage.all<{ label: string }>(
        "SELECT label FROM exercise_suggested_body_regions WHERE exercise_id = ?",
        [result.exerciseId],
      );
      expect(suggested).toEqual([{ label: "upper back" }]);
    } finally {
      storage.close();
    }
  });

  it("retries once without persisting when a suggested body region contains patient details", async () => {
    const draftWithPii = {
      ...VALID_STRETCH_DRAFT,
      body_regions: ["knee", "call jane 416-555-0199"],
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(envelope(JSON.stringify(draftWithPii)))
      .mockResolvedValueOnce(envelope(JSON.stringify(draftWithPii)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-pii-region"),
        "pii-region@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        runGenerator(
          generator,
          storage,
          {
            sql: storage,
            requestId: id("req-pii-region"),
            requestedName: "Heel slide",
            exerciseNote: null,
            requestedBy: practitioner,
            now: AFTER_FORM,
            providerAttempts: 2,
          },
          {
            exercises: new ExercisesRepository(storage),
            versions,
            requests,
          },
        ),
      ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_response_invalid" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      const suggestionCount = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercise_suggested_body_regions",
      );
      expect(suggestionCount?.count).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("fails schema validation after two provider attempts when aliases are empty", async () => {
    const emptyAliases = { ...VALID_STRETCH_DRAFT, aliases: [] };
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(emptyAliases)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-empty-alias"),
        "empty-alias@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        runGenerator(
          generator,
          storage,
          {
            sql: storage,
            requestId: id("req-empty-alias"),
            requestedName: "Heel slide",
            exerciseNote: null,
            requestedBy: practitioner,
            now: AFTER_FORM,
            providerAttempts: 2,
          },
          {
            exercises: new ExercisesRepository(storage),
            versions,
            requests,
          },
        ),
      ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_response_invalid" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      storage.close();
    }
  });

  it("persists unknown body region names as suggestions with one provider call", async () => {
    const draftWithSuggestion = {
      ...VALID_STRETCH_DRAFT,
      body_regions: ["knee", "upper back"],
    };
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(draftWithSuggestion)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const regionCountBefore = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      const practitioner = await seedPractitioner(
        storage,
        id("pr-suggest"),
        "suggest@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      const result = await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-suggest"),
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const regionCountAfter = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      expect(regionCountAfter?.count).toBe(regionCountBefore?.count);
      const linked = await storage.all<{ body_region_id: string }>(
        "SELECT body_region_id FROM exercise_body_regions WHERE exercise_id = ?",
        [result.exerciseId],
      );
      expect(linked.map((r) => r.body_region_id).sort()).toEqual(["br-knee"]);
      const suggested = await storage.all<{ label: string }>(
        "SELECT label FROM exercise_suggested_body_regions WHERE exercise_id = ?",
        [result.exerciseId],
      );
      expect(suggested).toEqual([{ label: "upper back" }]);
    } finally {
      storage.close();
    }
  });

  it("succeeds with one provider call when every body region name is unknown", async () => {
    const draftAllUnknown = {
      ...VALID_STRETCH_DRAFT,
      body_regions: ["upper back", "thoracic spine"],
    };
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(draftAllUnknown)));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const regionCountBefore = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      const practitioner = await seedPractitioner(
        storage,
        id("pr-all-unknown"),
        "all-unknown@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      const generatorInput = {
        sql: storage,
        requestId: id("req-all-unknown"),
        requestedName: "Cat-camel",
        exerciseNote: null,
        requestedBy: practitioner,
        now: AFTER_FORM,
      };
      const generatorRepos = {
        exercises: new ExercisesRepository(storage),
        versions,
        requests,
      };
      const resultPromise = runGenerator(
        generator,
        storage,
        generatorInput,
        generatorRepos,
      );
      await expect(resultPromise).resolves.toMatchObject({
        exerciseId: expect.any(String),
      });
      const result = await resultPromise;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const regionCountAfter = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      expect(regionCountAfter?.count).toBe(regionCountBefore?.count);
      const linked = await storage.all<{ body_region_id: string }>(
        "SELECT body_region_id FROM exercise_body_regions WHERE exercise_id = ?",
        [result.exerciseId],
      );
      expect(linked).toEqual([]);
      const suggested = await storage.all<{ label: string }>(
        "SELECT label FROM exercise_suggested_body_regions WHERE exercise_id = ?",
        [result.exerciseId],
      );
      expect(suggested.map((row) => row.label).sort()).toEqual([
        "thoracic spine",
        "upper back",
      ]);
    } finally {
      storage.close();
    }
  });

  it("includes regeneration note in the user message when provided", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = createDeepInfraExerciseDraftGenerator({ apiKey: "k", fetchImpl });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-regen"),
        "regen@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-regen"),
          requestedName: "Heel slide",
          exerciseNote: null,
          regenerationNote: "more detail",
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
      const messages = (
        JSON.parse(String(init.body)) as { messages: { content: string }[] }
      ).messages;
      expect(messages[1]?.content).toContain("Regenerate note: more detail");
    } finally {
      storage.close();
    }
  });

  it("enforces response size while streaming without content-length", async () => {
    const chunk = "x".repeat(DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES + 1);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    const response = new Response(stream, { status: 200 });
    await expect(
      readHttpResponseTextWithByteCap(
        response,
        DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES,
      ),
    ).rejects.toMatchObject({ code: "deepinfra_exercise_draft_response_too_large" });
  });

  it("accepts a response exactly at the streaming cap without content-length", async () => {
    const chunk = "y".repeat(DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    const text = await readHttpResponseTextWithByteCap(
      new Response(stream, { status: 200 }),
      DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES,
    );
    expect(text).toHaveLength(DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES);
  });

  it("uses the fake generator when PHYSIO_DEEPINFRA_API_KEY is absent", () => {
    expect(resolveExerciseDraftGenerator({})).toBe(fakeExerciseDraftGenerator);
  });

  it("uses the DeepInfra generator when PHYSIO_DEEPINFRA_API_KEY is set", () => {
    const gen = resolveExerciseDraftGenerator({ PHYSIO_DEEPINFRA_API_KEY: "present" });
    expect(gen).not.toBe(fakeExerciseDraftGenerator);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveExerciseDraftGenerator uses global fetch without illegal this binding (Worker wiring)", async () => {
    const globalFetch = stubThisSensitiveGlobalFetch(() =>
      envelope(JSON.stringify(VALID_STRETCH_DRAFT)),
    );
    const generator = resolveExerciseDraftGenerator({
      PHYSIO_DEEPINFRA_API_KEY: "present",
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-worker-fetch"),
        "wf@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-worker-fetch"),
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      expect(globalFetch).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });
});

describe("DeepInfra API key redaction on failures", () => {
  it("never echoes the sentinel key on invalid JSON envelope bodies", async () => {
    const echo = `not-json-Bearer-${SENTINEL_KEY}`;
    const fetchImpl = vi.fn(async () => envelope(echo));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-bad-envelope"),
        "be@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await expect(
        runGenerator(
          generator,
          storage,
          {
            sql: storage,
            requestId: id("req-bad-envelope"),
            requestedName: "Bad envelope",
            exerciseNote: null,
            requestedBy: practitioner,
            now: AFTER_FORM,
          },
          {
            exercises: new ExercisesRepository(storage),
            versions,
            requests,
          },
        ),
      ).rejects.toSatisfy((err) => {
        expectThrownErrorLeakFree(err, { apiKey: SENTINEL_KEY, jsonBody: echo });
        return true;
      });
    } finally {
      storage.close();
    }
  });

  it("never echoes the sentinel key in thrown error messages", async () => {
    const echo = '{"authorization":"Bearer ' + SENTINEL_KEY + '"}';
    const fetchImpl = vi.fn(async () => new Response(echo, { status: 502 }));
    const generator = createDeepInfraExerciseDraftGenerator({
      apiKey: SENTINEL_KEY,
      fetchImpl,
    });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-redact"),
        "r@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      const { ExercisesRepository } =
        await import("../src/storage/repositories/exercise-data.js");
      await expect(
        runGenerator(
          generator,
          storage,
          {
            sql: storage,
            requestId: id("req-redact"),
            requestedName: "Redact",
            exerciseNote: null,
            requestedBy: practitioner,
            now: AFTER_FORM,
          },
          {
            exercises: new ExercisesRepository(storage),
            versions,
            requests,
          },
        ),
      ).rejects.toSatisfy((err) => {
        expectThrownErrorLeakFree(err, { apiKey: SENTINEL_KEY, jsonBody: echo });
        return true;
      });
    } finally {
      storage.close();
    }
  });
});

describe("pinned URL constant (guard)", () => {
  it("matches the ticket chat completions path", () => {
    expect(DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL).toBe(
      "https://api.deepinfra.com/v1/openai/chat/completions",
    );
  });

  it("pins the default model id constant", () => {
    expect(DEFAULT_DEEPINFRA_EXERCISE_DRAFT_MODEL_ID).toBe(
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    );
  });

  it("pins the streaming response cap constant", () => {
    expect(DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES).toBe(512 * 1024);
  });
});

describe("DeepInfra request metadata guards", () => {
  it("sends response_format json_schema with strict true and the full system prompt", async () => {
    const fetchImpl = vi.fn(async () => envelope(JSON.stringify(VALID_STRETCH_DRAFT)));
    const generator = createDeepInfraExerciseDraftGenerator({ apiKey: "k", fetchImpl });
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-meta"),
        "meta@example.com",
      );
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      await runGenerator(
        generator,
        storage,
        {
          sql: storage,
          requestId: id("req-meta"),
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(storage),
          versions,
          requests,
        },
      );
      const body = requestBodyFromCall(
        (fetchImpl.mock.calls[0] as unknown as [string, RequestInit?])[1],
      );
      const responseFormat = body.response_format as {
        type: string;
        json_schema: { name: string; strict: boolean; schema: unknown };
      };
      expect(responseFormat.type).toBe("json_schema");
      expect(responseFormat.json_schema.strict).toBe(true);
      expect(responseFormat).toEqual(PINNED_EXERCISE_DRAFT_RESPONSE_FORMAT);
      const jsonSchema = responseFormat.json_schema.schema as Record<
        string,
        unknown
      > & {
        required: string[];
        properties: Record<string, unknown>;
      };
      expect(jsonSchema).toEqual(PINNED_EXERCISE_DRAFT_JSON_SCHEMA);
      expect(responseFormat.json_schema.name).toBe("exercise_draft");
      expect(jsonSchema.required).not.toContain("default_sets_and_reps");
      expect(jsonSchema.properties).not.toHaveProperty("default_sets_and_reps");
      expect(jsonSchema.properties.aliases).toMatchObject({ minItems: 1 });
      const bodyRegionsProp = jsonSchema.properties.body_regions as {
        enum?: unknown;
        minItems: number;
      };
      expect(bodyRegionsProp.enum).toBeUndefined();
      expect(bodyRegionsProp.minItems).toBe(1);
      const messages = body.messages as Array<{ role: string; content: string }>;
      expect(messages[0]?.content).toBe(PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT);
      expect(messages[0]?.content).toContain("Never include patient-identifying");
      expect(messages[0]?.content).toContain(
        "For body_regions, use free-text region names.",
      );
      expect(messages[0]?.content).not.toContain("default_sets_and_reps");
    } finally {
      storage.close();
    }
  });
});
