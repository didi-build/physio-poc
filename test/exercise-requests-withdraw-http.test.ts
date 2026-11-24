import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestPath,
  exerciseRequestWithdrawPath,
  exerciseRequestsCollectionPath,
  exerciseRequestsInProgressPath,
} from "../src/exercise-requests-api-paths.js";
import { DRAFT_GENERATION_LOCK_STALE_MS } from "../src/services/exercise-requests/draft-generation-lock.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { serviceGenerateRequestWithDrain } from "./helpers/test-draft-generation-workflow-port.js";

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
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId,
      email: "coach@example.com",
      displayName: "Coach",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function createOpenRequest(
  cookie: string,
  bundle: ReturnType<typeof deps>["deps"],
): Promise<string> {
  const created = await handleRequest(
    authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
      method: "POST",
      body: JSON.stringify({
        requested_name: "Open request",
        form_opened_at: FORM_OPENED,
      }),
    }),
    bundle,
  );
  expect(created.status).toBe(200);
  const body = (await created.json()) as { request_id: string };
  return body.request_id;
}

describe("POST /api/me/exercise-requests/:id/withdraw (DIDI-1278)", () => {
  it("returns 401 with no session", async () => {
    const storage = await openMigratedDatabase();
    try {
      await seedPractitioner(storage);
      const url = `${BASE}${exerciseRequestWithdrawPath(id("req-no-session"))}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            body: "{}",
            headers: { "content-type": "application/json" },
          }),
        ),
        {
          sql: storage,
          objects: new InMemoryObjectStorage(),
          config: MCP_TEST_CONFIG,
          mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
          auth: new FakeAuthPort({
            practitioner: {
              practitionerId: id("p"),
              email: "c@example.com",
              displayName: "C",
            },
          }),
        },
      );
      expect(response.status).toBe(401);
    } finally {
      storage.close();
    }
  });

  it("returns 404 for an unknown practitioner session", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, id("pr-own"), "owner@ex.com");
      const missingId = id("pract-missing-withdraw");
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: missingId,
          email: "ghost@example.com",
          displayName: "Ghost",
        },
      });
      const ownerBundle = deps(storage, owner);
      const requestId = await createOpenRequest(ownerBundle.cookie, ownerBundle.deps);
      const bundle = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
        auth,
      };
      const response = await handleRequest(
        authedJsonRequest(
          exerciseRequestWithdrawPath(requestId),
          auth.createSessionCookieHeader(),
          { method: "POST", body: "{}" },
        ),
        bundle,
      );
      await expect(response.json()).resolves.toMatchObject({
        error: "practitioner_not_found",
      });
      expect(response.status).toBe(404);
      const row = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.status).not.toBe("withdrawn");
    } finally {
      storage.close();
    }
  });

  it("rejects approved requests with no write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-app"), "a@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-approved-wd");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'Approved', NULL, ?, 'approved', NULL, ?, ?)`,
        [requestId, practitioner, TS, TS],
      );
      const before = await storage.first<{ updated_at: string }>(
        "SELECT updated_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "request_not_deletable",
        message: "Request not deletable",
      });
      const after = await storage.first<{ status: string; updated_at: string }>(
        "SELECT status, updated_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(after?.status).toBe("approved");
      expect(after?.updated_at).toBe(before?.updated_at);
    } finally {
      storage.close();
    }
  });

  it("returns success with no second write when already withdrawn", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-wd"), "w@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-already-wd");
      const updatedAt = "2026-10-30T12:00:00.000Z";
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'Gone', NULL, ?, 'withdrawn', NULL, ?, ?)`,
        [requestId, practitioner, TS, updatedAt],
      );
      const first = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { already_withdrawn: boolean };
      expect(firstBody.already_withdrawn).toBe(true);
      const second = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(second.status).toBe(200);
      const row = await storage.first<{ updated_at: string }>(
        "SELECT updated_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.updated_at).toBe(updatedAt);
    } finally {
      storage.close();
    }
  });

  it("rejects a fresh generation lock and leaves status unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-lock"), "l@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = await createOpenRequest(cookie, bundle);
      const lockAt = new Date().toISOString();
      await storage.run(
        `UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?`,
        [lockAt, requestId],
      );
      const before = await storage.first<{ updated_at: string }>(
        "SELECT updated_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "draft_generation_in_progress",
      });
      const row = await storage.first<{ status: string; updated_at: string }>(
        "SELECT status, updated_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.status).toBe("drafting");
      expect(row?.updated_at).toBe(before?.updated_at);
    } finally {
      storage.close();
    }
  });

  it("rejects practitioner_id in the withdraw body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-body"), "b@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = await createOpenRequest(cookie, bundle);
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: JSON.stringify({ practitioner_id: id("other-pr") }),
        }),
        bundle,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_input" });
      const row = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.status).not.toBe("withdrawn");
    } finally {
      storage.close();
    }
  });

  it("allows a different practitioner to withdraw another requester's draft (scope)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(storage, id("pr-req"), "req@ex.com");
      const reviewer = await seedPractitioner(storage, id("pr-rev"), "rev@ex.com");
      const { deps: bundle, cookie: requesterCookie } = deps(storage, requester);
      const requestId = await createOpenRequest(requesterCookie, bundle);
      const reviewerAuth = new FakeAuthPort({
        practitioner: {
          practitionerId: reviewer,
          email: "rev@ex.com",
          displayName: "Reviewer",
        },
      });
      const reviewerBundle = { ...bundle, auth: reviewerAuth };
      const response = await handleRequest(
        authedJsonRequest(
          exerciseRequestWithdrawPath(requestId),
          reviewerAuth.createSessionCookieHeader(),
          { method: "POST", body: "{}" },
        ),
        reviewerBundle,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "withdrawn",
        already_withdrawn: false,
      });
      const row = await storage.first<{ status: string; requested_by: string }>(
        "SELECT status, requested_by FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.status).toBe("withdrawn");
      expect(row?.requested_by).toBe(requester);
    } finally {
      storage.close();
    }
  });

  it("allows withdraw when the generation lock is expired", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-stale"), "s@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = await createOpenRequest(cookie, bundle);
      const nowMs = Date.now();
      const staleLock = new Date(
        nowMs - DRAFT_GENERATION_LOCK_STALE_MS - 60_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?`,
        [staleLock, requestId],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "withdrawn",
        already_withdrawn: false,
      });
      const row = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.status).toBe("withdrawn");
    } finally {
      storage.close();
    }
  });

  it("allows withdraw on a never-generated open request", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-open"), "o@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = await createOpenRequest(cookie, bundle);
      const rowBefore = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(rowBefore?.exercise_id).toBeNull();
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
    } finally {
      storage.close();
    }
  });

  it("sets withdrawn in one write and keeps the row and media", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-ok"), "ok@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Wall angels",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const createdBody = (await created.json()) as { request_id: string };
      const rid = createdBody.request_id;
      const { ExerciseRequestsService } =
        await import("../src/services/exercise-requests/exercise-requests-service.js");
      const { ExerciseMediaService } =
        await import("../src/services/exercise-media/exercise-media-service.js");
      const { FakeImageGeneration } =
        await import("../src/storage/adapters/memory/fake-image-generation.js");
      const { PrefixMediaStorage } =
        await import("../src/storage/adapters/memory/prefix-media-storage.js");
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T11:00:00.000Z",
      });
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(new InMemoryObjectStorage()),
      );
      await serviceGenerateRequestWithDrain(service, storage, {
        practitionerId: practitioner,
        requestId: rid,
        mediaService,
      });
      const exerciseRow = await storage.first<{ exercise_id: string | null }>(
        "SELECT exercise_id FROM exercise_requests WHERE id = ?",
        [rid],
      );
      if (!exerciseRow?.exercise_id) {
        throw new Error("expected exercise_id");
      }
      const exId = exerciseRow.exercise_id;
      const versionRow = await storage.first<{ media_set_id: string | null }>(
        `SELECT media_set_id FROM exercise_versions
         WHERE exercise_id = ? AND status = 'draft'
         ORDER BY version_number DESC LIMIT 1`,
        [exId],
      );
      expect(versionRow?.media_set_id).toBeTruthy();

      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(rid), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);

      const stillThere = await storage.first<{ id: string; status: string }>(
        "SELECT id, status FROM exercise_requests WHERE id = ?",
        [rid],
      );
      expect(stillThere?.status).toBe("withdrawn");

      const list = await handleRequest(
        new Request(`${BASE}${exerciseRequestsInProgressPath()}`, {
          headers: { cookie },
        }),
        bundle,
      );
      const listBody = (await list.json()) as { requests: { request_id: string }[] };
      expect(listBody.requests.some((r) => r.request_id === rid)).toBe(false);

      const getResponse = await handleRequest(
        new Request(`${BASE}${exerciseRequestPath(rid)}`, { headers: { cookie } }),
        bundle,
      );
      expect(getResponse.status).toBe(404);
    } finally {
      storage.close();
    }
  });

  it("pins generation_in_progress on the in-progress list for fresh, expired, and absent locks", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-list-gen"),
        "lg@ex.com",
      );
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const freshId = await createOpenRequest(cookie, bundle);
      await storage.run(
        `UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?`,
        [new Date().toISOString(), freshId],
      );
      const expiredId = await createOpenRequest(cookie, bundle);
      const staleLock = new Date(
        Date.now() - DRAFT_GENERATION_LOCK_STALE_MS - 60_000,
      ).toISOString();
      await storage.run(
        `UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?`,
        [staleLock, expiredId],
      );
      const absentId = await createOpenRequest(cookie, bundle);

      const list = await handleRequest(
        new Request(`${BASE}${exerciseRequestsInProgressPath()}`, {
          headers: { cookie },
        }),
        bundle,
      );
      expect(list.status).toBe(200);
      const body = (await list.json()) as {
        requests: { request_id: string; generation_in_progress: boolean }[];
      };
      const byId = Object.fromEntries(
        body.requests.map((r) => [r.request_id, r.generation_in_progress]),
      );
      expect(byId[freshId]).toBe(true);
      expect(byId[expiredId]).toBe(false);
      expect(byId[absentId]).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("keeps exercise_versions and media_set_id after withdraw", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-med-after"),
        "m@ex.com",
      );
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Media keep",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: rid } = (await created.json()) as { request_id: string };
      const { ExerciseRequestsService } =
        await import("../src/services/exercise-requests/exercise-requests-service.js");
      const { ExerciseMediaService } =
        await import("../src/services/exercise-media/exercise-media-service.js");
      const { FakeImageGeneration } =
        await import("../src/storage/adapters/memory/fake-image-generation.js");
      const { PrefixMediaStorage } =
        await import("../src/storage/adapters/memory/prefix-media-storage.js");
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T11:00:00.000Z",
      });
      const mediaService = new ExerciseMediaService(
        storage,
        new FakeImageGeneration(),
        new PrefixMediaStorage(new InMemoryObjectStorage()),
      );
      await serviceGenerateRequestWithDrain(service, storage, {
        practitionerId: practitioner,
        requestId: rid,
        mediaService,
      });
      const beforeVersion = await storage.first<{
        id: string;
        media_set_id: string | null;
        status: string;
      }>(
        `SELECT ev.id, ev.media_set_id, ev.status
         FROM exercise_versions ev
         JOIN exercise_requests er ON er.exercise_id = ev.exercise_id
         WHERE er.id = ? AND ev.status = 'draft'
         ORDER BY ev.version_number DESC LIMIT 1`,
        [rid],
      );
      expect(beforeVersion?.media_set_id).toBeTruthy();

      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(rid), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);

      const afterVersion = await storage.first<{
        id: string;
        media_set_id: string | null;
        status: string;
      }>(
        `SELECT ev.id, ev.media_set_id, ev.status
         FROM exercise_versions ev
         WHERE ev.id = ?`,
        [beforeVersion!.id],
      );
      expect(afterVersion?.status).toBe("draft");
      expect(afterVersion?.media_set_id).toBe(beforeVersion?.media_set_id);
    } finally {
      storage.close();
    }
  });
});
