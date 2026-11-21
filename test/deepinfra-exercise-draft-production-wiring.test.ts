import { afterEach, describe, expect, it, vi } from "vitest";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { createWorkerProductionAppDependencies } from "../src/adapters/workers/create-worker-production-app-dependencies.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
} from "../src/storage/repositories/exercise-data.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { stubThisSensitiveGlobalFetch } from "./helpers/this-sensitive-global-fetch.js";
import {
  openWorkerAuthTestDatabase,
  seedPractitioner,
} from "./helpers/worker-auth-d1-fixture.js";
import {
  seedDraftingExerciseRequest,
  seedPractitioner as seedExercisePractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { buildWorkerProductionAuthEnv } from "./helpers/worker-production-auth-test-utils.js";
import { DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL } from "../src/adapters/deepinfra/exercise-draft-ai-config.js";
import {
  PINNED_EXERCISE_DRAFT_RESPONSE_FORMAT,
  PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT,
} from "./fixtures/pinned-deepinfra-exercise-draft-literals.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { id } from "./helpers/opaque-test-ids.js";

function requestBodyFromCall(init?: RequestInit): Record<string, unknown> {
  const raw = init?.body;
  if (typeof raw !== "string") {
    throw new Error("expected JSON request body string");
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

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

const AFTER_FORM = "2026-10-30T11:00:00.000Z";

function envelope(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("DeepInfra exercise draft production wiring (DIDI-1008 QA R2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createWorkerProductionAppDependencies uses the real DeepInfra generator and global fetch", async () => {
    const globalFetch = stubThisSensitiveGlobalFetch(() =>
      envelope(JSON.stringify(VALID_STRETCH_DRAFT)),
    );
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-worker-wire"),
        "worker-wire@example.com",
      );
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_DEEPINFRA_API_KEY: "worker-wire-key",
      });
      const deps = createWorkerProductionAppDependencies(env);
      expect(deps.exerciseDraftGenerator).not.toBe(fakeExerciseDraftGenerator);
      const requests = new ExerciseRequestsRepository(storage);
      const versions = new ExerciseVersionsRepository(storage);
      const draftGenerator = deps.exerciseDraftGenerator;
      expect(draftGenerator).toBeDefined();
      const requestId = id("req-worker-wire");
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: practitioner,
        requestedName: "Heel slide",
      });
      await expect(
        draftGenerator!(
          {
            sql: storage,
            requestId,
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
        ),
      ).resolves.toMatchObject({ exerciseId: expect.any(String) });
      expect(globalFetch).toHaveBeenCalledTimes(1);
      const init = (globalFetch.mock.calls[0] as unknown as [string, RequestInit?])[1];
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer worker-wire-key");
    } finally {
      storage.close();
    }
  });

  it("createNodeAppDependencies without DeepInfra key keeps the fake draft generator (Node resolve wiring)", async () => {
    await expect(
      createNodeAppDependencies({
        AUTH_BASE_URL: "https://auth.example",
        PHYSIO_ALLOWED_GOOGLE_EMAILS: "node-wire@example.com",
        PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
        BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
      }),
    ).resolves.toMatchObject({
      exerciseDraftGenerator: fakeExerciseDraftGenerator,
    });
  });

  it("createNodeAppDependencies uses the real DeepInfra generator and global fetch", async () => {
    const globalFetch = stubThisSensitiveGlobalFetch(() =>
      envelope(JSON.stringify(VALID_STRETCH_DRAFT)),
    );
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: "https://auth.example",
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "node-wire@example.com",
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
      PHYSIO_DEEPINFRA_API_KEY: "node-wire-key",
    });
    expect(deps.exerciseDraftGenerator).not.toBe(fakeExerciseDraftGenerator);
    const practitioner = await seedExercisePractitioner(
      deps.sql,
      id("pr-node-wire"),
      "node-wire@example.com",
    );
    const requests = new ExerciseRequestsRepository(deps.sql);
    const versions = new ExerciseVersionsRepository(deps.sql);
    const draftGenerator = deps.exerciseDraftGenerator;
    expect(draftGenerator).toBeDefined();
    const requestId = id("req-node-wire");
    await seedDraftingExerciseRequest(deps.sql, {
      requestId,
      practitionerId: practitioner,
      requestedName: "Heel slide",
    });
    await expect(
      draftGenerator!(
        {
          sql: deps.sql,
          requestId,
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(deps.sql),
          versions,
          requests,
        },
      ),
    ).resolves.toMatchObject({ exerciseId: expect.any(String) });
    expect(globalFetch).toHaveBeenCalledTimes(1);
    const call = globalFetch.mock.calls[0] as unknown as
      [string, RequestInit?] | undefined;
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe(DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL);
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer node-wire-key");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = requestBodyFromCall(init);
    expect(body).toMatchObject({
      model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      messages: [
        { role: "system", content: PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT },
        {
          role: "user",
          content: "Exercise name: Heel slide\nNote: None",
        },
      ],
      response_format: PINNED_EXERCISE_DRAFT_RESPONSE_FORMAT,
    });
    expect(globalFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("createNodeAppDependencies passes PHYSIO_DEEPINFRA_EXERCISE_DRAFT_MODEL to the provider request", async () => {
    const overrideModel = "meta-llama/Llama-3.3-70B-Instruct-Turbo-override-pin";
    const globalFetch = stubThisSensitiveGlobalFetch(() =>
      envelope(JSON.stringify(VALID_STRETCH_DRAFT)),
    );
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: "https://auth.example",
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "node-model@example.com",
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
      PHYSIO_DEEPINFRA_API_KEY: "node-model-key",
      PHYSIO_DEEPINFRA_EXERCISE_DRAFT_MODEL: overrideModel,
    });
    const practitioner = await seedExercisePractitioner(
      deps.sql,
      id("pr-node-model"),
      "node-model@example.com",
    );
    const requests = new ExerciseRequestsRepository(deps.sql);
    const versions = new ExerciseVersionsRepository(deps.sql);
    const requestId = id("req-node-model");
    await seedDraftingExerciseRequest(deps.sql, {
      requestId,
      practitionerId: practitioner,
      requestedName: "Heel slide",
    });
    await expect(
      deps.exerciseDraftGenerator!(
        {
          sql: deps.sql,
          requestId,
          requestedName: "Heel slide",
          exerciseNote: null,
          requestedBy: practitioner,
          now: AFTER_FORM,
        },
        {
          exercises: new ExercisesRepository(deps.sql),
          versions,
          requests,
        },
      ),
    ).resolves.toMatchObject({ exerciseId: expect.any(String) });
    expect(globalFetch).toHaveBeenCalledTimes(1);
    const init = (globalFetch.mock.calls[0] as unknown as [string, RequestInit?])[1];
    const body = requestBodyFromCall(init);
    expect(body.model).toBe(overrideModel);
    expect(globalFetch).toHaveBeenCalledWith(
      DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL,
      expect.any(Object),
    );
  });
});
