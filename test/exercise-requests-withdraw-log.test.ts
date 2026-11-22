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

  it("emits exactly once on a fresh withdraw with the exact field set", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-log"), "log@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const created = await handleRequest(
        authedJsonRequest(exerciseRequestsCollectionPath(), cookie, {
          method: "POST",
          body: JSON.stringify({
            requested_name: "Log test",
            form_opened_at: FORM_OPENED,
          }),
        }),
        bundle,
      );
      const { request_id: requestId } = (await created.json()) as {
        request_id: string;
      };
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { already_withdrawn: boolean };
      expect(body.already_withdrawn).toBe(false);

      const withdrawLines = logSpy.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .filter((l: string) => l.includes(PIN_EVENT));
      expect(withdrawLines).toHaveLength(1);

      const parsed = parseWithdrawLog(logSpy);
      expect(parsed.event).toBe(PIN_EVENT);
      expect(Object.keys(parsed).sort()).toEqual(
        [
          "event",
          "previous_status",
          "practitioner_id",
          "request_id",
          "requester_practitioner_id",
        ].sort(),
      );
      expect(parsed.request_id).toBe(requestId);
      expect(parsed.practitioner_id).toBe(practitioner);
      expect(parsed.requester_practitioner_id).toBe(practitioner);
      expect(parsed.previous_status).toBe("drafting");
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

      await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      const secondLines = logSpy.mock.calls.filter((c) =>
        String(c[0]).includes(PIN_EVENT),
      );
      expect(secondLines).toHaveLength(0);

      const approvedId = id("req-approved-log");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'A', NULL, ?, 'approved', NULL, ?, ?)`,
        [approvedId, practitioner, TS, TS],
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(approvedId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes(PIN_EVENT))).toBe(
        false,
      );

      const openId = await (async () => {
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
        [new Date().toISOString(), openId],
      );
      await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(openId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes(PIN_EVENT))).toBe(
        false,
      );

      const ghost = new FakeAuthPort({
        practitioner: {
          practitionerId: id("pr-missing"),
          email: "g@example.com",
          displayName: "G",
        },
      });
      const ghostBundle = { ...bundle, auth: ghost };
      await handleRequest(
        authedJsonRequest(
          exerciseRequestWithdrawPath(requestId),
          ghost.createSessionCookieHeader(),
          { method: "POST", body: "{}" },
        ),
        ghostBundle,
      );
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes(PIN_EVENT))).toBe(
        false,
      );

      await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(id("missing-req")), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
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
