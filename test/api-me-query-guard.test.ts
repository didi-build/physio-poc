import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import { PROGRAMS_API_BASE } from "./helpers/program-builder-http-paths.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  API_ME_HTTP_METHODS,
  apiMeHttpJsonBody,
  apiMeHttpRouteCases,
  defaultApiMeHttpProbeContext,
  type ApiMeHttpRouteCase,
} from "./helpers/api-me-http-route-cases.js";
import {
  expectInvalidInputQueryGuardResponse,
  practitionerIdQuerySuffix,
  practitionerUnderscoreIdQuerySuffix,
} from "./helpers/invalid-input-query-guard.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import { ShareLinkDefaultsRepository } from "../src/storage/repositories/programs.js";

const BASE = "https://physio.test.example";

function authedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email: "coach@example.com",
      displayName: "Coach",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function seedApprovedForBuilder(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<void> {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await storage.run(
    `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
    [practitionerId, TS, FIXTURE_VERSION_ID],
  );
}

async function programCount(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<number> {
  const row = await storage.first<{ c: number }>(
    "SELECT COUNT(*) AS c FROM programs WHERE created_by = ? AND deleted_at IS NULL",
    [practitionerId],
  );
  return row?.c ?? 0;
}

async function snapshotPractitionerBDefaults(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerB: string,
) {
  return {
    shareLink: await storage.first(
      "SELECT id, expires_in, custom_expires_on FROM share_link_defaults WHERE scope = ? AND practitioner_id = ? LIMIT 1",
      ["practitioner", practitionerB],
    ),
    stretching: await storage.first<{ params_json: string }>(
      "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
      ["practitioner", practitionerB, "stretching"],
    ),
  };
}

async function snapshotProgramState(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
) {
  const programs = new ProgramsRepository(storage);
  const rows = new ProgramRowsRepository(storage);
  return {
    program: await programs.findById(programId),
    rows: await rows.listForProgram(programId),
  };
}

async function sendApiMeRouteWithMethod(
  deps: ReturnType<typeof apiDeps>["deps"],
  cookie: string,
  routeCase: ApiMeHttpRouteCase,
  method: string,
  querySuffix: string,
  body?: string,
): Promise<Response> {
  const url = `${BASE}${routeCase.path}${querySuffix}`;
  if (method === "GET") {
    return handleRequest(authedRequest(url, cookie, { method: "GET" }), deps);
  }
  const headers: Record<string, string> = { cookie };
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return handleRequest(
    new Request(
      url,
      mutatingAppApiRequestInit(url, {
        method,
        headers,
        body,
      }),
    ),
    deps,
  );
}

describe("/api/me query practitioner id guard (route table)", () => {
  it("returns identical invalid_input with stable headers for every /api/me route, HTTP method, and query spelling without changing B storage", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("api-me-query-b");
      await seedPractitioner(storage, practitionerB, "b-api-me-query@example.com");

      const programA = id("api-me-query-prog-a");
      const programB = id("api-me-query-prog-b");
      const rowA = id("api-me-query-row-a");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId: programA,
        name: "Program A",
      });
      await service.createProgram(practitionerB, {
        programId: programB,
        name: "Program B secret",
      });
      await seedApprovedForBuilder(storage, practitionerA);
      await new ExerciseRequestsRepository(storage).insert({
        id: id("api-me-query-req"),
        requestedName: "Pending row",
        requestedBy: practitionerA,
        status: "open",
        exerciseId: null,
        createdAt: TS,
        updatedAt: TS,
      });
      await service.addExerciseRow(practitionerA, programA, {
        rowId: rowA,
        exerciseId: FIXTURE_EXERCISE_ID,
      });

      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-api-me-query-b"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-api-me-query-b"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );

      const routeCases = apiMeHttpRouteCases(programA, rowA);
      const probeContext = defaultApiMeHttpProbeContext();
      const querySuffixBuilders = [
        practitionerIdQuerySuffix,
        practitionerUnderscoreIdQuerySuffix,
      ] as const;

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const beforeProgramA = await snapshotProgramState(storage, programA);
      const beforeProgramB = await snapshotProgramState(storage, programB);
      const beforeCountB = await programCount(storage, practitionerB);
      const beforeDefaultsB = await snapshotPractitionerBDefaults(
        storage,
        practitionerB,
      );

      let firstResponse = true;
      for (const querySuffixBuilder of querySuffixBuilders) {
        const querySuffix = querySuffixBuilder(practitionerB);
        for (const routeCase of routeCases) {
          for (const method of API_ME_HTTP_METHODS) {
            const body =
              method === "GET"
                ? undefined
                : apiMeHttpJsonBody({ ...routeCase, method }, probeContext);
            const response = await sendApiMeRouteWithMethod(
              deps,
              cookie,
              routeCase,
              method,
              querySuffix,
              body,
            );
            await expectInvalidInputQueryGuardResponse(response);
            firstResponse = false;
          }
        }
      }
      expect(firstResponse).toBe(false);

      expect(await snapshotProgramState(storage, programA)).toEqual(beforeProgramA);
      expect(await snapshotProgramState(storage, programB)).toEqual(beforeProgramB);
      expect(await programCount(storage, practitionerB)).toBe(beforeCountB);
      expect(await snapshotPractitionerBDefaults(storage, practitionerB)).toEqual(
        beforeDefaultsB,
      );
    } finally {
      storage.close();
    }
  });

  it("does not reject PractitionerId query spelling (case-sensitive guard keys)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("api-me-case-query-b");
      await seedPractitioner(storage, practitionerB, "b-case@example.com");
      const programId = id("api-me-case-query-a");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, {
        programId,
        name: "Visible to A only",
      });

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const response = await handleRequest(
        authedRequest(
          `${BASE}${PROGRAMS_API_BASE}?PractitionerId=${encodeURIComponent(practitionerB)}`,
          cookie,
        ),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { items: { program_id: string }[] };
      expect(body.items.map((item) => item.program_id)).toEqual([programId]);
      expect(await programCount(storage, practitionerB)).toBe(0);
    } finally {
      storage.close();
    }
  });
});
