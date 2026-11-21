import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestGeneratePath,
  exerciseRequestPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import {
  createFakeExerciseDraftGenerator,
  fakeExerciseDraftGenerator,
} from "../src/services/exercise-requests/fake-draft-generator.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { FailingFakeImageGeneration } from "./helpers/failing-fake-image-generation.js";
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

function deps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  exerciseDraftGenerator = fakeExerciseDraftGenerator,
  exerciseMediaImages?: FailingFakeImageGeneration,
) {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "Coach" },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      exerciseDraftGenerator,
      exerciseMediaImages,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function submitAndGenerate(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  generator = fakeExerciseDraftGenerator,
  images?: FailingFakeImageGeneration,
) {
  const { deps: bundle, cookie } = deps(
    storage,
    practitionerId,
    email,
    generator,
    images,
  );
  const created = await handleRequest(
    authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
      method: "POST",
      body: JSON.stringify({
        requested_name: "Heel slide draft",
        form_opened_at: FORM_OPENED,
      }),
    }),
    bundle,
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { request_id: string };
  const generated = await handleRequest(
    authedJsonRequest(exerciseRequestGeneratePath(body.request_id), cookie, {
      method: "POST",
      body: JSON.stringify({}),
    }),
    bundle,
  );
  return { generateResponse: generated, requestId: body.request_id, cookie, bundle };
}

describe("Exercise request draft generation HTTP (DIDI-1215)", () => {
  it("generates text then images on success", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-ok"),
        "ok@example.com",
      );
      const { generateResponse, requestId, cookie, bundle } = await submitAndGenerate(
        storage,
        practitioner,
        "ok@example.com",
      );
      expect(generateResponse.status).toBe(200);
      const payload = (await generateResponse.json()) as {
        outcome: string;
        view: {
          draft: { title: string } | null;
          generation: { first_draft_complete: boolean };
        };
      };
      expect(payload.outcome).toBe("complete");
      expect(payload.view.generation.first_draft_complete).toBe(true);
      expect(payload.view.draft?.title).toBe("Heel slide draft");

      const viewResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(requestId)}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const view = (await viewResponse.json()) as {
        generation: { first_draft_complete: boolean };
      };
      expect(view.generation.first_draft_complete).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("text failure stores nothing and can be retried", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-text"),
        "text@example.com",
      );
      const generator = createFakeExerciseDraftGenerator({ failText: true });
      const first = await submitAndGenerate(
        storage,
        practitioner,
        "text@example.com",
        generator,
      );
      expect(first.generateResponse.status).toBe(502);
      const row = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [first.requestId],
      );
      expect(row?.exercise_id).toBeNull();

      const retry = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(first.requestId), first.cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        { ...first.bundle, exerciseDraftGenerator: fakeExerciseDraftGenerator },
      );
      expect(retry.status).toBe(200);
    } finally {
      storage.close();
    }
  });

  it("image failure keeps text and can be retried", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-gen-img"),
        "img@example.com",
      );
      const failImages = new FailingFakeImageGeneration(true);
      const first = await submitAndGenerate(
        storage,
        practitioner,
        "img@example.com",
        fakeExerciseDraftGenerator,
        failImages,
      );
      expect(first.generateResponse.status).toBe(502);
      const row = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [first.requestId],
      );
      expect(row?.exercise_id).not.toBeNull();

      const retry = await handleRequest(
        authedJsonRequest(exerciseRequestGeneratePath(first.requestId), first.cookie, {
          method: "POST",
          body: JSON.stringify({}),
        }),
        { ...first.bundle, exerciseMediaImages: new FailingFakeImageGeneration(false) },
      );
      expect(retry.status).toBe(200);
    } finally {
      storage.close();
    }
  });

  it("rejects generate from a non-requester", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pr-req-own"),
        "own@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("pr-req-other"),
        "other@example.com",
      );
      const requestId = id("req-own-gen");
      await seedDraftingExerciseRequest(storage, {
        requestId,
        practitionerId: requester,
        requestedName: "Owned request",
      });
      const otherAuth = new FakeAuthPort({
        practitioner: {
          practitionerId: other,
          email: "other@example.com",
          displayName: "Other",
        },
      });
      const response = await handleRequest(
        authedJsonRequest(
          exerciseRequestGeneratePath(requestId),
          otherAuth.createSessionCookieHeader(),
          {
            method: "POST",
            body: JSON.stringify({}),
          },
        ),
        deps(storage, other, "other@example.com").deps,
      );
      expect(response.status).toBe(403);
    } finally {
      storage.close();
    }
  });
});
