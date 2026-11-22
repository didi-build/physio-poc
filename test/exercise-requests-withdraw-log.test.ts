import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestWithdrawPath,
  exerciseRequestsCollectionPath,
} from "../src/exercise-requests-api-paths.js";
import { REQUEST_WITHDRAWN_EVENT } from "../src/services/exercise-requests/request-withdrawn-log.js";
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

const BASE = "https://physio.test.example";
const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const PIN_EVENT = "physio_request_withdrawn";

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

function parseWithdrawLog(logSpy: { mock: { calls: unknown[][] } }) {
  const line = logSpy.mock.calls
    .map((c) => String(c[0]))
    .find((l) => l.includes(PIN_EVENT));
  expect(line).toBeTruthy();
  return JSON.parse(line!) as Record<string, unknown>;
}

describe("physio_request_withdrawn audit log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits on cross-practitioner withdraw with distinct actor and requester ids", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(storage, id("pr-req-log"), "req@ex.com");
      const actor = await seedPractitioner(storage, id("pr-act-log"), "act@ex.com");
      const { deps: bundle, cookie: requesterCookie } = deps(storage, requester);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), requesterCookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Cross log",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      const actorAuth = new FakeAuthPort({
        practitioner: {
          practitionerId: actor,
          email: "act@ex.com",
          displayName: "Actor",
        },
      });
      const response = await handleRequest(
        authedJsonRequest(
          exerciseRequestWithdrawPath(requestId),
          actorAuth.createSessionCookieHeader(),
          { method: "POST", body: "{}" },
        ),
        { ...bundle, auth: actorAuth },
      );
      expect(response.status).toBe(200);

      const parsed = parseWithdrawLog(logSpy);
      expect(parsed.event).toBe(PIN_EVENT);
      expect(parsed.practitioner_id).toBe(actor);
      expect(parsed.requester_practitioner_id).toBe(requester);
      expect(parsed.practitioner_id).not.toBe(parsed.requester_practitioner_id);
      expect(parsed.previous_status).toBe("drafting");
    } finally {
      storage.close();
    }
  });

  it("records previous_status open when withdrawing a stuck open request", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-open-log"),
        "open@ex.com",
      );
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Open stuck",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      await storage.run(
        `UPDATE exercise_requests SET status = 'open', exercise_id = NULL WHERE id = ?`,
        [requestId],
      );

      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);

      const parsed = parseWithdrawLog(logSpy);
      expect(parsed.previous_status).toBe("open");
    } finally {
      storage.close();
    }
  });

  it("does not emit on re-withdraw, rejection, lock block, missing practitioner, or missing request", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-nolog"), "no@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);

      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Once",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };

      await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      logSpy.mockClear();

      const reWithdraw = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(reWithdraw.status).toBe(200);
      expect(
        logSpy.mock.calls.filter((c) => String(c[0]).includes(PIN_EVENT)),
      ).toHaveLength(0);

      const approvedId = id("req-approved-log");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'A', NULL, ?, 'approved', NULL, ?, ?)`,
        [approvedId, practitioner, TS, TS],
      );
      const approvedRes = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(approvedId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(approvedRes.status).toBe(409);
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes(PIN_EVENT))).toBe(
        false,
      );

      const lockId = await (async () => {
        const r = await handleRequest(
          authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
            method: "POST",
            body: JSON.stringify({
              requested_name: "Lock",
              form_opened_at: FORM_OPENED,
            }),
          }),
          bundle,
        );
        return ((await r.json()) as { request_id: string }).request_id;
      })();
      await storage.run(
        `UPDATE exercise_requests SET draft_generation_locked_at = ? WHERE id = ?`,
        [new Date().toISOString(), lockId],
      );
      const lockRes = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(lockId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(lockRes.status).toBe(409);
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes(PIN_EVENT))).toBe(
        false,
      );

      const liveCreated = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Live",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const liveId = ((await liveCreated.json()) as { request_id: string }).request_id;

      const ghost = new FakeAuthPort({
        practitioner: {
          practitionerId: id("pr-missing"),
          email: "g@example.com",
          displayName: "G",
        },
      });
      const ghostRes = await handleRequest(
        authedJsonRequest(
          exerciseRequestWithdrawPath(liveId),
          ghost.createSessionCookieHeader(),
          { method: "POST", body: "{}" },
        ),
        { ...bundle, auth: ghost },
      );
      expect(ghostRes.status).toBe(404);
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes(PIN_EVENT))).toBe(
        false,
      );

      const missingRes = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(id("missing-req")), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(missingRes.status).toBe(404);
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes(PIN_EVENT))).toBe(
        false,
      );
    } finally {
      storage.close();
    }
  });

  it("uses REQUEST_WITHDRAWN_EVENT constant in production code", () => {
    expect(REQUEST_WITHDRAWN_EVENT).toBe(PIN_EVENT);
  });
});
