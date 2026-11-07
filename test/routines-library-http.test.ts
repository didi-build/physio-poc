import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { routineMyCopyPath } from "../src/routine-library-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineVersionsRepository,
} from "../src/storage/repositories/routines.js";
import {
  publishRoutine,
  seedTwoPractitioners,
} from "./helpers/from-routine-http-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { RoutinesLibraryService } from "../src/services/routines/index.js";

const BASE = "https://physio.test.example";

const INVALID_INPUT_BODY = {
  error: "invalid_input",
  message: "invalid_input",
} as const;

function appDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId,
      email,
      displayName: "Tester",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

describe("Routines library HTTP (session routes)", () => {
  it("rejects practitioner_id in POST and PATCH bodies with invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, author, {
        routine: "http-spoof-routine",
        draftVersion: "http-spoof-draft",
        row: "http-spoof-row",
        name: "Spoof guard",
      });
      const routineId = id("http-spoof-routine");
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;

      const saveSpoof = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "save", practitioner_id: author }),
          }),
        ),
        deps,
      );
      expect(saveSpoof.status).toBe(400);
      await expect(saveSpoof.json()).resolves.toEqual(INVALID_INPUT_BODY);
      expect(
        await new PractitionerRoutinesRepository(storage).findForPractitioner(
          author,
          routineId,
        ),
      ).toBeNull();

      await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "save" }),
          }),
        ),
        deps,
      );

      const patchSpoof = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              practitioner_id: author,
              rows: [
                {
                  position: 0,
                  exercise_id: FIXTURE_EXERCISE_ID,
                  exercise_version_id: FIXTURE_VERSION_ID,
                  prescription_type: "stretching",
                  params: { hold_s: 40, per_day: { min: 1, max: 2 }, days_per_week: 7 },
                },
              ],
            }),
          }),
        ),
        deps,
      );
      expect(patchSpoof.status).toBe(400);
      await expect(patchSpoof.json()).resolves.toEqual(INVALID_INPUT_BODY);

      const rows = await new PractitionerRoutineRowsRepository(storage).listForCopy(
        (await new PractitionerRoutinesRepository(storage).findForPractitioner(
          author,
          routineId,
        ))!.id,
      );
      expect(rows[0]?.params_json).toContain('"hold_s":30');
    } finally {
      storage.close();
    }
  });

  it("returns undo_mismatch when undo snapshot names another practitioner without writing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const routineId = id("http-undo-mismatch-routine");
      await publishRoutine(storage, practitionerB, {
        routine: "http-undo-mismatch-routine",
        draftVersion: "http-undo-mismatch-draft",
        row: "http-undo-mismatch-row",
        name: "Undo mismatch",
      });
      await new RoutinesLibraryService(storage, MCP_TEST_CONFIG).saveToMyRoutines(
        practitionerB,
        routineId,
      );
      const { undo } = await new RoutinesLibraryService(
        storage,
        MCP_TEST_CONFIG,
      ).updateMyCopy({
        practitionerId: practitionerB,
        routineId,
        rows: [
          {
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: { hold_s: 40, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      const before = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(practitionerB, routineId);
      const rowRepo = new PractitionerRoutineRowsRepository(storage);
      const beforeRows = await rowRepo.listForCopy(before!.id);
      const { deps, cookie } = appDeps(storage, practitionerA, "a@example.com");
      const undoUrl = `${BASE}${routineMyCopyPath(routineId)}`;
      const response = await handleRequest(
        new Request(
          undoUrl,
          mutatingAppApiRequestInit(undoUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "undo", undo }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "undo_mismatch",
        message: "Undo snapshot does not match URL",
      });
      const afterRows = await rowRepo.listForCopy(before!.id);
      expect(afterRows).toEqual(beforeRows);
    } finally {
      storage.close();
    }
  });

  it("POST undo overwrites an intervening PATCH edit (exercise-library undo contract)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-undo-overwrite-routine");
      await publishRoutine(storage, author, {
        routine: "http-undo-overwrite-routine",
        draftVersion: "http-undo-overwrite-draft",
        row: "http-undo-overwrite-row",
        name: "Undo overwrite HTTP",
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;

      const save = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "save" }),
          }),
        ),
        deps,
      );
      expect(save.status).toBe(200);

      const firstPatch = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              rows: [
                {
                  position: 0,
                  exercise_id: FIXTURE_EXERCISE_ID,
                  exercise_version_id: FIXTURE_VERSION_ID,
                  prescription_type: "stretching",
                  params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
                },
              ],
            }),
          }),
        ),
        deps,
      );
      expect(firstPatch.status).toBe(200);
      const { undo } = (await firstPatch.json()) as { undo: unknown };

      await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              rows: [
                {
                  position: 0,
                  exercise_id: FIXTURE_EXERCISE_ID,
                  exercise_version_id: FIXTURE_VERSION_ID,
                  prescription_type: "stretching",
                  params: { hold_s: 99, per_day: { min: 1, max: 2 }, days_per_week: 7 },
                },
              ],
            }),
          }),
        ),
        deps,
      );

      const undoResponse = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "undo", undo }),
          }),
        ),
        deps,
      );
      expect(undoResponse.status).toBe(200);

      const copy = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(author, routineId);
      const rows = await new PractitionerRoutineRowsRepository(storage).listForCopy(
        copy!.id,
      );
      expect(rows[0]?.params_json).toContain('"hold_s":30');
    } finally {
      storage.close();
    }
  });

  it("maps stale_write to HTTP 409 on adopt_community_version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-stale-adopt-routine");
      const v1 = await publishRoutine(storage, author, {
        routine: "http-stale-adopt-routine",
        draftVersion: "http-stale-adopt-draft",
        row: "http-stale-adopt-row",
        name: "Stale adopt HTTP",
      });
      await new RoutineVersionsRepository(storage).savePublishedVersion({
        id: id("http-stale-adopt-rv2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Stale adopt HTTP v2",
        copyFromVersionId: v1.id,
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;
      const save = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "save" }),
          }),
        ),
        deps,
      );
      expect(save.status).toBe(200);

      const replace =
        PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished;
      PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished =
        async function staleStub() {
          const { RoutineRepositoryError } =
            await import("../src/storage/repositories/routines.js");
          throw new RoutineRepositoryError("Stale write", { code: "stale_write" });
        };
      try {
        const adopt = await handleRequest(
          new Request(
            myCopyUrl,
            mutatingAppApiRequestInit(myCopyUrl, {
              method: "POST",
              headers: { cookie, "content-type": "application/json" },
              body: JSON.stringify({ action: "adopt_community_version" }),
            }),
          ),
          deps,
        );
        expect(adopt.status).toBe(409);
        await expect(adopt.json()).resolves.toMatchObject({
          error: "stale_write",
        });
      } finally {
        PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished =
          replace;
      }
    } finally {
      storage.close();
    }
  });
});
