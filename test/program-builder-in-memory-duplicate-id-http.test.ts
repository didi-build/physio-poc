import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";
import {
  PROGRAM_ID_ALREADY_IN_USE,
  ProgramRepositoryError,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { PROGRAMS_API_BASE } from "./helpers/program-builder-http-paths.js";
import {
  INVALID_INPUT_QUERY_GUARD_BODY,
  sortedHeaderEntries,
} from "./helpers/invalid-input-query-guard.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { TS, seedPractitioner } from "./helpers/exercise-sqlite-fixture.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

describe("Program duplicate id over HTTP with Worker in-memory SqlStoragePort", () => {
  it("returns invalid_input instead of 500 when program_id already exists (own or foreign owner)", async () => {
    const storage = new InMemorySqlStorage();
    const practitionerA = await seedPractitioner(storage);
    const practitionerB = testOpaqueEntityId("worker-dup-b");
    await seedPractitioner(storage, practitionerB, "worker-dup-b@example.com");
    const sharedProgramId = id("worker-dup-program");
    const programs = new ProgramsRepository(storage);
    await programs.create({
      id: sharedProgramId,
      createdBy: practitionerA,
      createdAt: TS,
      name: "Existing",
    });

    const authA = new FakeAuthPort({
      practitioner: {
        practitionerId: practitionerA,
        email: "a-worker@example.com",
        displayName: "A",
      },
    });
    const authB = new FakeAuthPort({
      practitioner: {
        practitionerId: practitionerB,
        email: "b-worker@example.com",
        displayName: "B",
      },
    });
    const depsBase = {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    };

    const cookieA = authA.createSessionCookieHeader();
    const cookieB = authB.createSessionCookieHeader();
    const ownUrl = `${BASE}${PROGRAMS_API_BASE}`;
    const ownDuplicate = await handleRequest(
      new Request(
        ownUrl,
        mutatingAppApiRequestInit(ownUrl, {
          method: "POST",
          headers: { cookie: cookieA },
          body: JSON.stringify({ program_id: sharedProgramId }),
        }),
      ),
      { ...depsBase, auth: authA },
    );
    const foreignDuplicate = await handleRequest(
      new Request(
        ownUrl,
        mutatingAppApiRequestInit(ownUrl, {
          method: "POST",
          headers: { cookie: cookieB },
          body: JSON.stringify({ program_id: sharedProgramId }),
        }),
      ),
      { ...depsBase, auth: authB },
    );

    expect(ownDuplicate.status).toBe(400);
    expect(foreignDuplicate.status).toBe(400);
    expect(await ownDuplicate.json()).toEqual(INVALID_INPUT_QUERY_GUARD_BODY);
    expect(await foreignDuplicate.json()).toEqual(INVALID_INPUT_QUERY_GUARD_BODY);
    expect(sortedHeaderEntries(foreignDuplicate)).toEqual(
      sortedHeaderEntries(ownDuplicate),
    );

    const service = new ProgramBuilderService(storage);
    await expect(
      service.createProgram(practitionerA, { programId: sharedProgramId }),
    ).rejects.toMatchObject({ code: "invalid_input", message: "invalid_input" });
    await expect(
      programs.create({
        id: sharedProgramId,
        createdBy: practitionerB,
        createdAt: TS,
      }),
    ).rejects.toEqual(new ProgramRepositoryError(PROGRAM_ID_ALREADY_IN_USE));
  });
});
