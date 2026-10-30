import { describe, expect, it, vi } from "vitest";
import { FalFluxKleinImageGeneration } from "../src/adapters/node/fal-flux-klein-image-generation.js";
import { handleRequest, type AppDependencies } from "../src/http/app.js";
import {
  exerciseMediaSessionCookie,
  exerciseMediaTestDeps,
} from "./helpers/exercise-media-http.js";
import {
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import {
  expectConsoleCallsLeakFree,
  restoreConsoleSpies,
  spyAllConsoleLevels,
} from "./helpers/console-log-leak-assertions.js";
import { authedAppApiRequest } from "./helpers/app-api-request.js";

function mediaHttpDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  extras: Partial<AppDependencies> = {},
) {
  return exerciseMediaTestDeps(
    storage,
    {
      practitionerId,
      email: "coach@example.com",
      displayName: "Coach",
    },
    extras,
  );
}

function mediaRequest(
  url: string,
  deps: AppDependencies,
  init: RequestInit = {},
): Request {
  return authedAppApiRequest(url, exerciseMediaSessionCookie(deps), init);
}

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
  return { practitionerId, exerciseId, versionId: FIXTURE_VERSION_ID };
}

describe("Exercise media HTTP routes (integration)", () => {
  it("returns 400 invalid_input when access is missing or not public or internal", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { versionId, practitionerId } = await seedDraftVersion(storage);
      const deps = mediaHttpDeps(storage, practitionerId);
      for (const url of [
        `http://127.0.0.1/api/exercise-versions/${versionId}/media`,
        `http://127.0.0.1/api/exercise-versions/${versionId}/media?access=bogus`,
      ]) {
        const response = await handleRequest(mediaRequest(url, deps), deps);
        expect(response.status).toBe(400);
        const payload = (await response.json()) as { error?: string };
        expect(payload.error).toBe("invalid_input");
      }
    } finally {
      storage.close();
    }
  });

  it("generates draft media and blocks public serving until approved", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const deps = mediaHttpDeps(storage, practitionerId);
      const generate = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/generate`,
          deps,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          },
        ),
        deps,
      );
      expect(generate.status).toBe(201);

      const publicServe = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/exercise-versions/${versionId}/media?access=public`,
          deps,
        ),
        deps,
      );
      expect(publicServe.status).toBe(404);

      const internalServe = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/exercise-versions/${versionId}/media?access=internal`,
          deps,
        ),
        deps,
      );
      expect(internalServe.status).toBe(200);
    } finally {
      storage.close();
    }
  });

  it("returns 429 when the daily regeneration cap is reached", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const deps = mediaHttpDeps(storage, practitionerId);
      await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/generate`,
          deps,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          },
        ),
        deps,
      );

      for (let i = 0; i < 5; i += 1) {
        const regen = await handleRequest(
          mediaRequest(
            `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
            deps,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ scope: "start" }),
            },
          ),
          deps,
        );
        expect(regen.status).toBe(200);
      }

      const capped = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
          deps,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end" }),
          },
        ),
        deps,
      );
      expect(capped.status).toBe(429);
      const payload = (await capped.json()) as { error?: string };
      expect(payload.error).toBe("daily_limit_reached");
    } finally {
      storage.close();
    }
  });

  it("returns 409 for end-only regeneration when start_provider_url is missing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const mediaSetId = id("ms-no-start-url");
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mediaSetId,
          `media-sets/${mediaSetId}/start.png`,
          `media-sets/${mediaSetId}/end.png`,
          null,
          "draft",
          TS,
        ],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        versionId,
      ]);

      const deps = mediaHttpDeps(storage, practitionerId);
      const response = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
          deps,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end" }),
          },
        ),
        deps,
      );
      expect(response.status).toBe(409);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toBe("start_reference_unavailable");
    } finally {
      storage.close();
    }
  });

  it("does not echo fal response bodies or regeneration notes in API errors", async () => {
    const storage = await openMigratedDatabase();
    const note = 'slow "tempo"\nline two';
    const jsonBody = JSON.stringify({ detail: note });
    const apiKey = "fal-test-key-must-not-appear-in-errors";
    const fetchImpl = vi.fn(async () => new Response(jsonBody, { status: 401 }));
    const fal = new FalFluxKleinImageGeneration({ apiKey, fetchImpl });
    const consoleSpies = spyAllConsoleLevels();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const deps = mediaHttpDeps(storage, practitionerId, {
        exerciseMediaImages: fal,
      });
      const response = await handleRequest(
        mediaRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/generate`,
          deps,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note }),
          },
        ),
        deps,
      );
      expect(response.status).toBe(502);
      const text = await response.text();
      expect(text).not.toContain(apiKey);
      expect(text).not.toContain(note);
      expect(text).not.toContain(jsonBody);
      expect(text).toContain("fal_api_request_failed");
      expectConsoleCallsLeakFree(consoleSpies, { note, jsonBody, apiKey });
    } finally {
      restoreConsoleSpies(consoleSpies);
      storage.close();
    }
  });
});
