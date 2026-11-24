import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { handleExerciseMediaRequest } from "../src/http/routes/exercise-media.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestPath,
} from "../src/exercise-requests-api-paths.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  attachDraftGenerationTestWorkflow,
  drainDraftGeneration,
} from "./helpers/draft-generation-test-workflow.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

describe("DIDI-1276 empty-text pre-AI draft generate", () => {
  it("drafts text into the existing version then generates images on one POST /generate", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-empty-text"),
        "pre@example.com",
      );
      const requestId = id("req-empty-text");
      const exerciseId = await seedExercise(storage, practitioner, id("ex-empty-text"));
      const versionId = id("ver-empty-text");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          title: "Dumbbell Shoulder Press",
          description: "",
          starting_position: "",
          ending_position: "",
          steps: "",
        }),
      );
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: practitioner,
        requestedName: "Dumbbell Shoulder Press",
      });
      await storage.run("UPDATE exercise_requests SET exercise_id = ? WHERE id = ?", [
        exerciseId,
        requestId,
      ]);

      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "pre@example.com",
          displayName: "Coach",
        },
      });
      const baseDeps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: fakeExerciseDraftGenerator,
        exerciseMediaImages: new FakeImageGeneration(),
        extraRouteHandlers: [handleExerciseMediaRequest],
      };
      const requestService = new ExerciseRequestsService(
        baseDeps.sql,
        baseDeps.config,
        {
          draftGenerator: fakeExerciseDraftGenerator,
        },
      );
      const { deps: bundle, workflow } = attachDraftGenerationTestWorkflow(
        baseDeps,
        (rid) => requestService.loadDraftView(rid),
      );
      const cookie = auth.createSessionCookieHeader();

      const generated = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(generated.status).toBe(202);
      const payload = (await generated.json()) as {
        outcome: string;
        started_elsewhere?: boolean;
      };
      expect(payload.outcome).toBe("in_progress");
      expect(payload).toMatchObject({
        outcome: "in_progress",
        started_elsewhere: false,
      });
      await drainDraftGeneration(workflow, requestId);

      const version = await storage.first<{ description: string; steps: string }>(
        "SELECT description, steps FROM exercise_versions WHERE id = ?",
        [versionId],
      );
      expect(version?.description?.trim().length).toBeGreaterThan(0);
      expect(version?.steps?.trim().length).toBeGreaterThan(0);

      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const view = (await viewResponse.json()) as {
        draft: { description: string } | null;
        generation: { first_draft_complete: boolean };
      };
      expect(view.generation.first_draft_complete).toBe(true);
      expect(view.draft?.description?.trim().length).toBeGreaterThan(0);
    } finally {
      storage.close();
    }
  });
});
