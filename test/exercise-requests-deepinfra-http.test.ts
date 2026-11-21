import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${BASE}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

describe("Exercise requests submit upstream AI failure (DIDI-1008)", () => {
  it("returns 502 with typed error code without passing provider HTTP status", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-http-502"),
        "h502@example.com",
      );
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response("{}", { status: 503 }))
        .mockResolvedValueOnce(new Response("{}", { status: 503 }));
      const generator = createDeepInfraExerciseDraftGenerator({
        apiKey: "key",
        fetchImpl,
      });
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "h502@example.com",
          displayName: "H",
        },
      });
      const cookie = auth.createSessionCookieHeader();
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: generator,
      };
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Upstream fail",
            form_opened_at: FORM_OPENED,
          }),
        }),
        deps,
      );
      const createdBody = (await created.json()) as { request_id: string };
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(createdBody.request_id), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status).toBe(502);
      const payload = await response.json();
      expect(payload).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_request_failed",
      });
    } finally {
      storage.close();
    }
  });

  it("returns 502 when the model alias looks like an email (E01)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-http-email-alias"),
        "e01@example.com",
      );
      const emailAliasDraft = {
        title: "Heel slide",
        aliases: ["jane@example.com"],
        category: "stretch",
        body_regions: ["knee"],
        description: "Gentle knee flexion stretch.",
        equipment: "Mat",
        starting_position: "Supine on mat.",
        steps: "1. Bend knee",
        common_mistakes: "Rushing",
        regressions: "Smaller range",
        progressions: "Hold longer",
        precautions: "Stop if pain",
        cue_stretching: "Move slowly",
        cue_isometric: null,
        cue_concentric: null,
        cue_eccentric: null,
      };
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(emailAliasDraft) } }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(emailAliasDraft) } }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      const generator = createDeepInfraExerciseDraftGenerator({
        apiKey: "key",
        fetchImpl,
      });
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitioner,
          email: "e01@example.com",
          displayName: "E",
        },
      });
      const cookie = auth.createSessionCookieHeader();
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        exerciseDraftGenerator: generator,
      };
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Email alias draft",
            form_opened_at: FORM_OPENED,
          }),
        }),
        deps,
      );
      const createdBody = (await created.json()) as { request_id: string };
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(createdBody.request_id), cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(response.status).toBe(502);
      const payload = await response.json();
      expect(payload).toMatchObject({
        outcome: "text_failed",
        error: "deepinfra_exercise_draft_response_invalid",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      storage.close();
    }
  });
});
