import { describe, expect, it, vi } from "vitest";
import { FalFluxKleinImageGeneration } from "../src/adapters/node/fal-flux-klein-image-generation.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { exerciseMediaExtraRouteHandlers } from "./helpers/exercise-media-http.js";
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

function mediaHttpDeps(storage: Awaited<ReturnType<typeof openMigratedDatabase>>) {
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
  };
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
  it("generates draft media and blocks public serving until approved", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const deps = mediaHttpDeps(storage);
      const generate = await handleRequest(
        new Request(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/generate`,
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
        new Request(
          `http://127.0.0.1/api/exercise-versions/${versionId}/media?access=public`,
        ),
        deps,
      );
      expect(publicServe.status).toBe(404);

      const internalServe = await handleRequest(
        new Request(
          `http://127.0.0.1/api/exercise-versions/${versionId}/media?access=internal`,
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
      const deps = mediaHttpDeps(storage);
      await handleRequest(
        new Request(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/generate`,
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
          new Request(
            `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
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
        new Request(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
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

      const response = await handleRequest(
        new Request(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/regenerate`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: "end" }),
          },
        ),
        mediaHttpDeps(storage),
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
      const response = await handleRequest(
        new Request(
          `http://127.0.0.1/api/practitioners/${practitionerId}/exercise-versions/${versionId}/media/generate`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ note }),
          },
        ),
        {
          ...mediaHttpDeps(storage),
          exerciseMediaImages: fal,
        },
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
