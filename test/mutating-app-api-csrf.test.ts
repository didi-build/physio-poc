import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import {
  isMutatingAppApiPath,
  rejectMutatingAppApiCsrf,
} from "../src/http/mutating-app-api-csrf.js";
import {
  MUTATING_APP_API_ROUTE_SAMPLES,
  mutatingAppApiRouteSampleKey,
} from "../src/http/mutating-app-api-route-registry.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const PRACTITIONER_ID = testOpaqueEntityId("csrf-practitioner");
const EXERCISE_ID = "ex-csrf-1";

async function seedApproved(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  exerciseId: string,
): Promise<void> {
  await storage.run(
    "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
    [exerciseId, "stretch", practitionerId, "2026-01-01T00:00:00.000Z"],
  );
  await storage.run(
    `INSERT INTO exercise_versions (
      id, exercise_id, version_number, status, approved_by, approved_at,
      title, description, equipment, starting_position, steps,
      common_mistakes, regressions, progressions, precautions,
      cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
      media_set_id, change_summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "ver-csrf-1",
      exerciseId,
      1,
      "approved",
      practitionerId,
      "2026-01-01T00:00:00.000Z",
      "Example",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      null,
      null,
      null,
      null,
      null,
      null,
      "2026-01-01T00:00:00.000Z",
    ],
  );
}

function sameOriginJsonHeaders(origin = new URL(BASE).origin): HeadersInit {
  return {
    origin,
    "content-type": "application/json",
  };
}

function mutatingBody(path: string, method: string): string | undefined {
  if (method === "DELETE") {
    return undefined;
  }
  if (path.includes("/media/regenerate")) {
    return JSON.stringify({ scope: "both", note: null });
  }
  if (path.includes("/media/generate")) {
    return JSON.stringify({});
  }
  if (method === "PATCH") {
    return JSON.stringify({ text_overrides: { title: "mine" } });
  }
  return JSON.stringify({ action: "save" });
}

describe("mutating app API CSRF guard", () => {
  it("pins every mutating app API route in the route registry", () => {
    const keys = MUTATING_APP_API_ROUTE_SAMPLES.map(
      mutatingAppApiRouteSampleKey,
    ).sort();
    expect(keys.length).toBeGreaterThan(0);
    for (const sample of MUTATING_APP_API_ROUTE_SAMPLES) {
      expect(isMutatingAppApiPath(sample.samplePath, sample.method)).toBe(true);
    }
  });

  it("returns 403 for cross-origin mutating requests with a valid session and changes nothing", async () => {
    const storage = await openMigratedDatabase();
    await seedPractitioner(storage, PRACTITIONER_ID);
    await seedApproved(storage, PRACTITIONER_ID, EXERCISE_ID);
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: PRACTITIONER_ID,
        email: "csrf.test@example.com",
        displayName: "Tester",
      },
    });
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    };
    const cookie = auth.createSessionCookieHeader();

    for (const sample of MUTATING_APP_API_ROUTE_SAMPLES) {
      const path = sample.samplePath.replace(
        "11111111-1111-4111-8111-111111111111",
        PRACTITIONER_ID,
      );
      const url = `${BASE}${path}`;
      const before = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ?",
        [PRACTITIONER_ID, EXERCISE_ID],
      );
      const response = await handleRequest(
        new Request(url, {
          method: sample.method,
          headers: {
            cookie,
            origin: "https://evil.example.com",
            "content-type": "application/json",
          },
          body: mutatingBody(path, sample.method),
        }),
        deps,
      );
      expect(response.status, mutatingAppApiRouteSampleKey(sample)).toBe(403);
      const after = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM practitioner_exercises WHERE practitioner_id = ? AND exercise_id = ?",
        [PRACTITIONER_ID, EXERCISE_ID],
      );
      expect(after?.count).toBe(before?.count);
    }
  });

  it("returns 415 for non-JSON content types and changes nothing", async () => {
    const storage = await openMigratedDatabase();
    await seedPractitioner(storage, PRACTITIONER_ID);
    await seedApproved(storage, PRACTITIONER_ID, EXERCISE_ID);
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: PRACTITIONER_ID,
        email: "csrf.test@example.com",
        displayName: "Tester",
      },
    });
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    };
    const cookie = auth.createSessionCookieHeader();
    const sample = MUTATING_APP_API_ROUTE_SAMPLES.find(
      (entry) =>
        entry.method === "POST" && entry.ruleId === "exercise-library-my-exercises",
    );
    expect(sample).toBeDefined();
    const path = sample!.samplePath.replace(
      "11111111-1111-4111-8111-111111111111",
      PRACTITIONER_ID,
    );
    const response = await handleRequest(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: {
          cookie,
          origin: new URL(BASE).origin,
          "content-type": "text/plain",
        },
        body: "action=save",
      }),
      deps,
    );
    expect(response.status).toBe(415);
  });

  it("allows same-origin JSON mutating requests", async () => {
    const storage = await openMigratedDatabase();
    await seedPractitioner(storage, PRACTITIONER_ID);
    await seedApproved(storage, PRACTITIONER_ID, EXERCISE_ID);
    const auth = new FakeAuthPort({
      practitioner: {
        practitionerId: PRACTITIONER_ID,
        email: "csrf.test@example.com",
        displayName: "Tester",
      },
    });
    const deps = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    };
    const cookie = auth.createSessionCookieHeader();
    const path = `/api/practitioners/${PRACTITIONER_ID}/my-exercises/${EXERCISE_ID}`;
    const response = await handleRequest(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: { cookie, ...sameOriginJsonHeaders() },
        body: JSON.stringify({ action: "save" }),
      }),
      deps,
    );
    expect(response.status).toBe(200);
  });

  it("does not guard GET app API routes", async () => {
    const request = new Request(
      `${BASE}/api/practitioners/${PRACTITIONER_ID}/my-exercises`,
      {
        method: "GET",
      },
    );
    expect(rejectMutatingAppApiCsrf(request, MCP_TEST_CONFIG)).toBeNull();
  });
});
