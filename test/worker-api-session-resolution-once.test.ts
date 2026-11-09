import { describe, expect, it, vi } from "vitest";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import type { AuthPort, PractitionerSession } from "../src/auth/auth-port.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { PRACTITIONER_SESSION_API_PATH } from "../src/practitioner-session-api-paths.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { openMigratedDatabase } from "./helpers/exercise-sqlite-fixture.js";
import {
  createWorkerProductionAuthTestDeps,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";

const BASE = "https://physio.test.example";

class CountingPractitionerSessionAuthPort implements AuthPort {
  readonly getPractitioner = vi.fn(
    async (_request: Request): Promise<PractitionerSession | null> => {
      return this.inner.getPractitioner(_request);
    },
  );

  constructor(private readonly inner: FakeAuthPort) {}

  handleAuthRequest(request: Request): Promise<Response | null> {
    return this.inner.handleAuthRequest(request);
  }

  signOut(request: Request): Promise<Response> {
    return this.inner.signOut(request);
  }
}

function wrapSqlCountingPractitionerReads(inner: SqlStoragePort) {
  let practitionerLookupCount = 0;
  const sql: SqlStoragePort = {
    run: (statement, bindings) => inner.run(statement, bindings),
    all: (statement, bindings) => inner.all(statement, bindings),
    batch: (statements) => inner.batch(statements),
    first: async (statement, bindings) => {
      const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("from practitioners")) {
        practitionerLookupCount += 1;
      }
      return inner.first(statement, bindings);
    },
  };
  return { sql, practitionerLookupCount: () => practitionerLookupCount };
}

describe("Worker /api session resolution once per request (DIDI-1187)", () => {
  it("calls getPractitioner exactly once for GET /api/me/session", async () => {
    const storage = await openMigratedDatabase();
    const practitionerId = testOpaqueEntityId("session-once-http");
    const inner = new FakeAuthPort({
      practitioner: {
        practitionerId,
        email: "once@example.com",
        displayName: "Once Coach",
      },
    });
    const auth = new CountingPractitionerSessionAuthPort(inner);
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      auth,
    };

    const response = await handleRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, {
        headers: { cookie: inner.createSessionCookieHeader() },
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(auth.getPractitioner).toHaveBeenCalledTimes(1);
  });

  it("calls better-auth getSession once and two practitioner SQL reads for a protected worker route", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps();
    expect(deps.auth).toBeInstanceOf(BetterAuthPort);
    const port = deps.auth as BetterAuthPort;
    const getSession = vi.spyOn(port.getBetterAuthRuntime().api, "getSession");
    const { sql, practitionerLookupCount } = wrapSqlCountingPractitionerReads(deps.sql);
    const wiredDeps = { ...deps, sql };

    const sessionResponse = await handleRequest(
      new Request(`${WORKER_PRODUCTION_TEST_BASE}${PRACTITIONER_SESSION_API_PATH}`),
      wiredDeps,
    );
    expect(sessionResponse.status).toBe(401);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(practitionerLookupCount()).toBe(0);
    getSession.mockRestore();
  });
});
