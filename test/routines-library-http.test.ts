import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  ROUTINES_COMMUNITY_SEARCH_PATH,
  ROUTINES_MY_ROUTINES_PATH,
  routineDetailsPath,
  routineMyCopyPath,
} from "../src/routine-library-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  PractitionerRoutineRowsRepository,
  ConditionsRepository,
  PractitionerRoutinesRepository,
  RoutineVersionRowsRepository,
  RoutinesRepository,
  RoutineVersionsRepository,
} from "../src/storage/repositories/routines.js";
import {
  publishRoutine,
  seedTwoPractitioners,
} from "./helpers/from-routine-http-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { RoutinesLibraryService } from "../src/services/routines/index.js";
import { installRealStaleDeleteCopyFixture } from "./helpers/routines-delete-batch-fixture.js";

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

  it("maps stale_write to HTTP 409 on DELETE remove", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const wrongPractitioner = await seedPractitioner(
        storage,
        id("http-stale-delete-wrong"),
        "del-wrong@example.com",
      );
      const routineId = id("http-stale-delete-routine");
      await publishRoutine(storage, author, {
        routine: "http-stale-delete-routine",
        draftVersion: "http-stale-delete-draft",
        row: "http-stale-delete-row",
        name: "Stale delete HTTP",
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

      const restore = installRealStaleDeleteCopyFixture(wrongPractitioner);
      try {
        const remove = await handleRequest(
          new Request(
            myCopyUrl,
            mutatingAppApiRequestInit(myCopyUrl, {
              method: "DELETE",
              headers: { cookie },
            }),
          ),
          deps,
        );
        expect(remove.status).toBe(409);
        await expect(remove.json()).resolves.toMatchObject({
          error: "stale_write",
        });
      } finally {
        restore();
      }
      expect(
        await new PractitionerRoutinesRepository(storage).findForPractitioner(
          author,
          routineId,
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("maps stale_write to HTTP 409 on undo with had_copy false", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const wrongPractitioner = await seedPractitioner(
        storage,
        id("http-stale-undo-del-wrong"),
        "undo-del-wrong@example.com",
      );
      const routineId = id("http-stale-undo-delete-routine");
      await publishRoutine(storage, author, {
        routine: "http-stale-undo-delete-routine",
        draftVersion: "http-stale-undo-delete-draft",
        row: "http-stale-undo-delete-row",
        name: "Stale undo delete HTTP",
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
      const { undo } = (await save.json()) as { undo: unknown };

      const restore = installRealStaleDeleteCopyFixture(wrongPractitioner);
      try {
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
        expect(undoResponse.status).toBe(409);
        await expect(undoResponse.json()).resolves.toMatchObject({
          error: "stale_write",
        });
      } finally {
        restore();
      }
    } finally {
      storage.close();
    }
  });

  it("POST undo with had_copy false and no saved copy returns 200", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-undo-no-prior-routine");
      await publishRoutine(storage, author, {
        routine: "http-undo-no-prior-routine",
        draftVersion: "http-undo-no-prior-draft",
        row: "http-undo-no-prior-row",
        name: "Undo no prior HTTP",
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;
      const undoResponse = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "undo",
              undo: {
                practitioner_id: author,
                routine_id: routineId,
                snapshot: { had_copy: false, copy: null },
              },
            }),
          }),
        ),
        deps,
      );
      expect(undoResponse.status).toBe(200);
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

  it("returns condition_options on community search and my routines list when conditions are empty", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, author, {
        routine: "http-cond-empty",
        draftVersion: "http-cond-empty-draft",
        row: "http-cond-empty-row",
        name: "Plain knee",
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const search = await handleRequest(
        new Request(`${BASE}${ROUTINES_COMMUNITY_SEARCH_PATH}`, {
          method: "GET",
          headers: { cookie },
        }),
        deps,
      );
      expect(search.status).toBe(200);
      await expect(search.json()).resolves.toMatchObject({
        conditions_available: false,
        condition_options: [],
      });
      const mine = await handleRequest(
        new Request(`${BASE}${ROUTINES_MY_ROUTINES_PATH}`, {
          method: "GET",
          headers: { cookie },
        }),
        deps,
      );
      expect(mine.status).toBe(200);
      await expect(mine.json()).resolves.toMatchObject({
        conditions_available: false,
        condition_options: [],
      });
    } finally {
      storage.close();
    }
  });

  it("returns condition_options on both list endpoints when conditions are configured", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const condId = id("http-cond-arthritis");
      await new ConditionsRepository(storage).insert({
        id: condId,
        label: "Arthritis",
      });
      const routineId = id("http-cond-filled");
      await new RoutinesRepository(storage).createDraft({
        id: routineId,
        draftVersionId: id("http-cond-filled-draft-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: "br-knee",
        conditionId: condId,
        name: "Arthritis knee HTTP",
      });
      await new RoutineVersionRowsRepository(storage).replaceDraftRow({
        id: id("http-cond-filled-row"),
        routineId,
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      await new RoutineVersionsRepository(storage).publishDraft({
        routineId,
        authorId: author,
        publishedAt: TS,
        name: "Arthritis knee HTTP",
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const search = await handleRequest(
        new Request(`${BASE}${ROUTINES_COMMUNITY_SEARCH_PATH}`, {
          method: "GET",
          headers: { cookie },
        }),
        deps,
      );
      const searchBody = (await search.json()) as {
        conditions_available: boolean;
        condition_options: { condition_id: string; label: string }[];
      };
      expect(searchBody.conditions_available).toBe(true);
      expect(searchBody.condition_options).toEqual([
        { condition_id: condId, label: "Arthritis" },
      ]);
      const mine = await handleRequest(
        new Request(`${BASE}${ROUTINES_MY_ROUTINES_PATH}`, {
          method: "GET",
          headers: { cookie },
        }),
        deps,
      );
      const mineBody = (await mine.json()) as typeof searchBody;
      expect(mineBody.conditions_available).toBe(true);
      expect(mineBody.condition_options).toEqual([
        { condition_id: condId, label: "Arthritis" },
      ]);
    } finally {
      storage.close();
    }
  });

  it("returns 401 without a session on routines library writes and detail read", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-401-routine");
      await publishRoutine(storage, author, {
        routine: "http-401-routine",
        draftVersion: "http-401-draft",
        row: "http-401-row",
        name: "401 guard",
      });
      const { deps } = appDeps(storage, author, "a@example.com");
      const detail = await handleRequest(
        new Request(`${BASE}${routineDetailsPath(routineId)}`, { method: "GET" }),
        deps,
      );
      expect(detail.status).toBe(401);
      const save = await handleRequest(
        new Request(
          `${BASE}${routineMyCopyPath(routineId)}`,
          mutatingAppApiRequestInit(`${BASE}${routineMyCopyPath(routineId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "save" }),
          }),
        ),
        deps,
      );
      expect(save.status).toBe(401);
    } finally {
      storage.close();
    }
  });

  it("adopts community version over HTTP then undo restores rows and source version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-adopt-undo");
      const v1 = await publishRoutine(storage, author, {
        routine: "http-adopt-undo",
        draftVersion: "http-adopt-undo-draft",
        row: "http-adopt-undo-row",
        name: "Adopt undo HTTP",
        hold_s: 30,
      });
      const versions = new RoutineVersionsRepository(storage);
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;

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

      await versions.savePublishedVersion({
        id: id("http-adopt-undo-v2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Adopt undo HTTP v2",
        copyFromVersionId: v1.id,
      });

      const patch = await handleRequest(
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
                  params: { hold_s: 45, per_day: { min: 1, max: 2 }, days_per_week: 7 },
                },
              ],
            }),
          }),
        ),
        deps,
      );
      expect(patch.status).toBe(200);

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
      expect(adopt.status).toBe(200);
      const { undo } = (await adopt.json()) as {
        undo: unknown;
        adopted_version: number;
      };

      const adopted = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(author, routineId);
      expect(adopted?.source_version_number).toBe(2);
      expect(adopted?.edited).toBe(0);
      const adoptedRows = await new PractitionerRoutineRowsRepository(
        storage,
      ).listForCopy(adopted!.id);
      expect(adoptedRows[0]?.params_json).toContain('"hold_s":30');

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

      const restored = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(author, routineId);
      expect(restored?.source_version_number).toBe(1);
      expect(restored?.edited).toBe(1);
      const restoredRows = await new PractitionerRoutineRowsRepository(
        storage,
      ).listForCopy(restored!.id);
      expect(restoredRows[0]?.params_json).toContain('"hold_s":45');
    } finally {
      storage.close();
    }
  });

  it("returns 404 when mutating my copy without a saved copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-no-copy");
      await publishRoutine(storage, author, {
        routine: "http-no-copy",
        draftVersion: "http-no-copy-draft",
        row: "http-no-copy-row",
        name: "No copy HTTP",
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;

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
      expect(adopt.status).toBe(404);
      await expect(adopt.json()).resolves.toMatchObject({
        error: "my_routine_not_found",
      });

      const remove = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(remove.status).toBe(404);
      await expect(remove.json()).resolves.toMatchObject({
        error: "my_routine_not_found",
      });
    } finally {
      storage.close();
    }
  });

  it("removes then undoes via HTTP restoring the saved copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-remove-undo");
      await publishRoutine(storage, author, {
        routine: "http-remove-undo",
        draftVersion: "http-remove-undo-draft",
        row: "http-remove-undo-row",
        name: "Remove undo HTTP",
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;
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
      const remove = await handleRequest(
        new Request(
          myCopyUrl,
          mutatingAppApiRequestInit(myCopyUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      const { undo } = (await remove.json()) as { undo: unknown };
      expect(
        await new PractitionerRoutinesRepository(storage).findForPractitioner(
          author,
          routineId,
        ),
      ).toBeNull();
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
      expect(
        await new PractitionerRoutinesRepository(storage).findForPractitioner(
          author,
          routineId,
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("GET routine details returns community_change_list entries over HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("http-community-changes");
      const v1 = await publishRoutine(storage, author, {
        routine: "http-community-changes",
        draftVersion: "http-community-changes-draft",
        row: "http-community-changes-row",
        name: "HTTP community changes",
      });
      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;
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
      const versions = new RoutineVersionsRepository(storage);
      const v2 = await versions.savePublishedVersion({
        id: id("http-cc-v2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "HTTP community changes v2",
        copyFromVersionId: v1.id,
        changeSummary: "Row one\nRow two",
      });
      await versions.savePublishedVersion({
        id: id("http-cc-v3"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "HTTP community changes v3",
        copyFromVersionId: v2.id,
      });

      const detailUrl = `${BASE}${routineDetailsPath(routineId)}`;
      const response = await handleRequest(
        new Request(detailUrl, { headers: { cookie } }),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        community_change_list: {
          entries: { version_number: number; change_summary: string | null }[];
        } | null;
        personal_changes: unknown;
      };
      expect(body.community_change_list).toEqual({
        baseline_available: true,
        entries: [
          { version_number: 2, change_summary: "Row one\nRow two" },
          { version_number: 3, change_summary: null },
        ],
      });
      expect(body.personal_changes).toMatchObject({
        baseline_available: true,
        change_count: 0,
      });
    } finally {
      storage.close();
    }
  });
});
