/**
 * Guards for DIDI-1278 QA R3 named mutants (integration + unit).
 * @vitest-environment jsdom (focus + layout cases)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/http/app.js";
import {
  exerciseRequestWithdrawPath,
  exerciseRequestsInProgressPath,
} from "../src/exercise-requests-api-paths.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
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
import { REQUEST_WITHDRAWN_EVENT } from "../src/services/exercise-requests/request-withdrawn-log.js";
import {
  ExerciseRequestsClient,
  type FetchFn,
} from "../src/ui/api/exercise-requests-client.js";
import { focusAfterRequestsListDelete } from "../src/ui/exercise-requests/requests-list-delete-focus.js";
import {
  DRAFT_ITEM_LOAD_TITLE,
  LOAD_TRY_AGAIN,
} from "../src/ui/copy/shared-load-states.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = "https://physio.test.example";

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

describe("DIDI-1278 QA R3 mutant guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("M05: approved request with fresh lock returns request_not_deletable, not draft_generation_in_progress", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-app-lock"),
        "al@ex.com",
      );
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-app-lock");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id,
          draft_generation_locked_at, created_at, updated_at
        ) VALUES (?, 'Approved locked', NULL, ?, 'approved', NULL, ?, ?, ?)`,
        [requestId, practitioner, new Date().toISOString(), TS, TS],
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
      });
    } finally {
      storage.close();
    }
  });

  it("M06: idempotent re-withdraw does not issue extra withdraw UPDATE attempts", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-idem"),
        "idem@ex.com",
      );
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-idem");
      const updatedAt = "2026-10-30T12:00:00.000Z";
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'Gone', NULL, ?, 'withdrawn', NULL, ?, ?)`,
        [requestId, practitioner, TS, updatedAt],
      );
      let withdrawUpdateAttempts = 0;
      const originalRun = storage.run.bind(storage);
      vi.spyOn(storage, "run").mockImplementation(async (sql, bindings) => {
        if (
          sql.includes("SET status = 'withdrawn'") &&
          sql.includes("exercise_requests")
        ) {
          withdrawUpdateAttempts += 1;
        }
        return originalRun(sql, bindings);
      });

      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        already_withdrawn: true,
      });
      expect(withdrawUpdateAttempts).toBe(1);

      const row = await storage.first<{ updated_at: string }>(
        "SELECT updated_at FROM exercise_requests WHERE id = ?",
        [requestId],
      );
      expect(row?.updated_at).toBe(updatedAt);
    } finally {
      storage.close();
    }
  });

  it("A03: physio_request_withdrawn log line has only the documented payload fields", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-a03"), "a03@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const requestId = id("req-a03");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, 'Audit', NULL, ?, 'open', NULL, ?, ?)`,
        [requestId, practitioner, TS, TS],
      );
      const response = await handleRequest(
        authedJsonRequest(exerciseRequestWithdrawPath(requestId), cookie, {
          method: "POST",
          body: "{}",
        }),
        bundle,
      );
      expect(response.status).toBe(200);
      const line = logSpy.mock.calls
        .map((c) => String(c[0]))
        .find((l) => l.includes(REQUEST_WITHDRAWN_EVENT));
      expect(line).toBeTruthy();
      const parsed = JSON.parse(line!) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(
        [
          "event",
          "practitioner_id",
          "previous_status",
          "request_id",
          "requester_practitioner_id",
        ].sort(),
      );
    } finally {
      storage.close();
    }
  });

  it("M02: withdrawRequest POSTs to /withdraw and does not short-circuit locally", async () => {
    const fetchFn = vi.fn<FetchFn>(async () => {
      return new Response(
        JSON.stringify({
          request_id: "req-m02",
          status: "withdrawn",
          already_withdrawn: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const client = new ExerciseRequestsClient({ fetchFn });
    await client.withdrawRequest("req-m02");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toContain("/withdraw");
    expect(init?.method).toBe("POST");
  });

  it("L1: draft item load title string matches design copy", () => {
    expect(DRAFT_ITEM_LOAD_TITLE).toBe("Couldn't load this draft.");
  });

  it("N5/F1: focusAfterRequestsListDelete focuses the row after the deleted index, not the first review link", () => {
    const listRoot = document.createElement("div");
    listRoot.innerHTML = `
      <motion.article data-testid="ex-requests-row-focus">
        <a data-testid="ex-requests-review-row-0" href="#0">R0</a>
      </motion.article>
      <motion.article data-testid="ex-requests-row-focus">
        <a data-testid="ex-requests-review-row-1" href="#1">R1</a>
      </motion.article>
      <motion.article data-testid="ex-requests-row-focus">
        <a data-testid="ex-requests-review-row-2" href="#2">R2</a>
      </motion.article>
    `.replaceAll("motion.", "");
    document.body.append(listRoot);
    const heading = document.createElement("h1");
    const row0Review = listRoot.querySelector<HTMLElement>(
      '[data-testid="ex-requests-review-row-0"]',
    )!;
    const row1Review = listRoot.querySelector<HTMLElement>(
      '[data-testid="ex-requests-review-row-1"]',
    )!;
    const focusRow0 = vi.spyOn(row0Review, "focus");
    const focusRow1 = vi.spyOn(row1Review, "focus");
    focusAfterRequestsListDelete({
      listRoot,
      heading,
      deletedIndex: 1,
    });
    expect(focusRow1).toHaveBeenCalled();
    expect(focusRow0).not.toHaveBeenCalled();
  });

  it("Q1: review quota uses margin-left auto for toolbar right alignment", () => {
    const css = readFileSync(
      path.resolve(import.meta.dirname, "../src/ui/styles/exercise-library.css"),
      "utf8",
    );
    expect(css).toMatch(/\.ex-review-quota\s*\{[^}]*margin-left:\s*auto/);
  });

  it("S14: in-progress list reports generation_in_progress from lock freshness", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-s14"), "s14@ex.com");
      const { deps: bundle, cookie } = deps(storage, practitioner);
      const openId = id("req-open-s14");
      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id,
          draft_generation_locked_at, created_at, updated_at
        ) VALUES (?, 'Lock', NULL, ?, 'open', NULL, ?, ?, ?)`,
        [openId, practitioner, new Date().toISOString(), TS, TS],
      );
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
      const row = body.requests.find((r) => r.request_id === openId);
      expect(row?.generation_in_progress).toBe(true);
    } finally {
      storage.close();
    }
  });
});

describe("DIDI-1278 QA R3 copy guards", () => {
  it("L2: load Try again label is not the in-progress label when idle", () => {
    expect(LOAD_TRY_AGAIN).toBe("Try again");
    expect(LOAD_TRY_AGAIN).not.toBe("Trying again...");
  });
});
