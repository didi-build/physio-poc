import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { rejectQueryPractitionerId } from "../src/http/reject-query-practitioner-id.js";
import { PROGRAMS_API_BASE } from "./helpers/program-builder-http-paths.js";
import {
  CANONICAL_INVALID_INPUT_QUERY_GUARD_HEADERS,
  expectInvalidInputQueryGuardResponse,
  sortedHeaderEntries,
} from "./helpers/invalid-input-query-guard.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

describe("invalid_input query guard canonical response", () => {
  it("matches fixed canonical headers and body through handleRequest and rejectQueryPractitionerId", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("canonical-query-b");
      const guardUrl = new URL(
        `${BASE}${PROGRAMS_API_BASE}?practitionerId=${practitionerB}`,
      );
      const fromGuard = rejectQueryPractitionerId(guardUrl);
      expect(fromGuard).not.toBeNull();
      expect(sortedHeaderEntries(fromGuard!)).toEqual([
        ...CANONICAL_INVALID_INPUT_QUERY_GUARD_HEADERS,
      ]);

      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitionerA,
          email: "a@example.com",
          displayName: "A",
        },
      });
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
        auth,
      };
      const response = await handleRequest(
        new Request(`${BASE}${PROGRAMS_API_BASE}?practitionerId=${practitionerB}`, {
          headers: { cookie: auth.createSessionCookieHeader() },
        }),
        deps,
      );
      await expectInvalidInputQueryGuardResponse(response);
    } finally {
      storage.close();
    }
  });
});
