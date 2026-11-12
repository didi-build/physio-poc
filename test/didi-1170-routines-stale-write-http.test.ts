import { describe, expect, it } from "vitest";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { routineAuthoringItemPath } from "../src/routine-authoring-api-paths.js";
import {
  routineDetailsPath,
  routineMyCopyPath,
} from "../src/routine-library-api-paths.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import {
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
  RoutineVersionsRepository,
  RoutinesRepository,
  RoutineVersionRowsRepository,
} from "../src/storage/repositories/routines.js";
import { programsFromRoutinePath } from "./helpers/program-builder-http-paths.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
} from "../src/storage/migrations/apply.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  MIGRATION_0007_SQL,
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";
import {
  publishRoutine,
  seedApprovedExerciseForBuilder,
  seedTwoPractitioners,
} from "./helpers/from-routine-http-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import {
  batchIncludesReplaceSavedCopyFromPublished,
  batchIncludesRoutinePublishedVersionGuard,
  batchIncludesSaveFrozenCopy,
  batchIncludesSavePublishedVersion,
  wrapSqlStorageWithBeforeBatchHook,
} from "./helpers/batch-interleave-sql-storage.js";
import type { AppDependencies } from "../src/http/app.js";

const BASE = "https://physio.test.example";
const BODY_REGION_KNEE = "br-knee";

type MigratedStorage = Awaited<ReturnType<typeof openMigratedDatabase>>;

function asMigratedStorage(storage: SqlStoragePort): MigratedStorage {
  return storage as MigratedStorage;
}

type StorageCase = {
  label: string;
  open: () => Promise<SqlStoragePort & { close?: () => void }>;
};

async function applyRoutineMigrations(storage: SqlStoragePort): Promise<void> {
  await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(storage, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(storage, MIGRATION_0007_ID, MIGRATION_0007_SQL);
}

async function openMigratedD1SqlStorage(): Promise<D1SqlStorage> {
  const sql = new D1SqlStorage(createFakePhysioD1Database());
  await applyRoutineMigrations(sql);
  return sql;
}

const STORAGE_CASES: StorageCase[] = [
  { label: "BetterSqliteStorage", open: () => openMigratedDatabase() },
  { label: "D1SqlStorage fake", open: () => openMigratedD1SqlStorage() },
];

function appDeps(
  storage: SqlStoragePort,
  practitionerId: string,
  email: string,
): { deps: AppDependencies; cookie: string } {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "Tester" },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

function rowPayload(holdS = 30) {
  return [
    {
      position: 0,
      exercise_id: FIXTURE_EXERCISE_ID,
      exercise_version_id: FIXTURE_VERSION_ID,
      prescription_type: "stretching",
      params: { hold_s: holdS, per_day: { min: 1, max: 2 }, days_per_week: 7 },
    },
  ];
}

async function seedAuthoringDraft(
  storage: SqlStoragePort,
  author: string,
  label: string,
): Promise<string> {
  const routineId = id(`1170-draft-${label}`);
  const routines = new RoutinesRepository(storage);
  const rows = new RoutineVersionRowsRepository(storage);
  await routines.createDraft({
    id: routineId,
    draftVersionId: id(`1170-draft-ver-${label}`),
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
    name: "Publish race draft",
  });
  await rows.replaceDraftRow({
    id: id(`1170-draft-row-${label}`),
    routineId,
    authorId: author,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
    draftUpdatedAt: TS,
  });
  return routineId;
}

describe.each(STORAGE_CASES)(
  "DIDI-1170 stale_write HTTP races ($label)",
  ({ label, open }) => {
    it("publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(
          storage,
          id(`1170-pub-${label}`),
          `pub-${label}@example.com`,
        );
        await seedApprovedExerciseForBuilder(asMigratedStorage(storage), author);
        const routineId = await seedAuthoringDraft(storage, author, `pub-${label}`);
        const { deps, cookie } = appDeps(storage, author, `pub-${label}@example.com`);
        const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
        const publishInit = mutatingAppApiRequestInit(itemUrl, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ action: "publish", name: "Race publish" }),
        });
        const [a, b] = await Promise.all([
          handleRequest(new Request(itemUrl, publishInit), deps),
          handleRequest(new Request(itemUrl, publishInit), deps),
        ]);
        const statuses = [a.status, b.status].sort();
        expect(statuses).toEqual([200, 409]);
        const stale = a.status === 409 ? a : b.status === 409 ? b : null;
        expect(stale).not.toBeNull();
        expect(((await stale!.json()) as { error: string }).error).toBe("stale_write");
        const routine = await new RoutinesRepository(storage).findById(routineId);
        expect(routine?.published_version).toBe(1);
        const publishedCount = (
          await storage.first<{ c: number }>(
            `SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ? AND status = 'published'`,
            [routineId],
          )
        )?.c;
        expect(publishedCount).toBe(1);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("save_community_version: competing version save before batch returns 409 stale_write with no extra published row", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(
          storage,
          id(`1170-save-${label}`),
          `save-${label}@example.com`,
        );
        await seedApprovedExerciseForBuilder(asMigratedStorage(storage), author);
        const routineId = id(`1170-save-routine-${label}`);
        const v1 = await publishRoutine(asMigratedStorage(storage), author, {
          routine: `1170-save-routine-${label}`,
          draftVersion: `1170-save-draft-${label}`,
          row: `1170-save-row-${label}`,
          name: "Save race v1",
        });
        const versions = new RoutineVersionsRepository(storage);
        const v2Id = id(`1170-save-v2-${label}`);
        const publishedBeforeVictim = (
          await storage.first<{ c: number }>(
            `SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ? AND status = 'published'`,
            [routineId],
          )
        )?.c;
        const interleaved = wrapSqlStorageWithBeforeBatchHook(storage, {
          shouldHook: batchIncludesSavePublishedVersion,
          once: true,
          runCompetingWrite: async () => {
            await versions.savePublishedVersion({
              id: v2Id,
              routineId,
              createdBy: author,
              createdAt: TS,
              name: "Competing v2",
              copyFromVersionId: v1.id,
            });
          },
        });
        const { deps, cookie } = appDeps(
          interleaved,
          author,
          `save-${label}@example.com`,
        );
        const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
        const save = await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "POST",
              headers: { cookie, "content-type": "application/json" },
              body: JSON.stringify({
                action: "save_community_version",
                expected_published_version: 1,
                name: "Attempted v3",
                rows: rowPayload(44),
              }),
            }),
          ),
          deps,
        );
        expect(save.status).toBe(409);
        expect(((await save.json()) as { error: string }).error).toBe("stale_write");
        const versionsAfter = (
          await storage.first<{ c: number }>(
            `SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ? AND status = 'published'`,
            [routineId],
          )
        )?.c;
        expect(versionsAfter).toBe((publishedBeforeVictim ?? 0) + 1);
        const routine = await new RoutinesRepository(storage).findById(routineId);
        expect(routine?.published_version).toBe(2);
        expect(
          await storage.first<{ id: string }>(
            `SELECT id FROM routine_versions WHERE routine_id = ? AND version_number = 3`,
            [routineId],
          ),
        ).toBeNull();
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row", async () => {
      const storage = await open();
      try {
        const { practitionerA: author } = await seedTwoPractitioners(
          asMigratedStorage(storage),
        );
        const routineId = id(`1170-freeze-${label}`);
        const v1 = await publishRoutine(asMigratedStorage(storage), author, {
          routine: `1170-freeze-${label}`,
          draftVersion: `1170-freeze-draft-${label}`,
          row: `1170-freeze-row-${label}`,
          name: "Freeze race v1",
        });
        const versions = new RoutineVersionsRepository(storage);
        const v2Id = id(`1170-freeze-v2-${label}`);
        const interleaved = wrapSqlStorageWithBeforeBatchHook(storage, {
          shouldHook: batchIncludesSaveFrozenCopy,
          once: true,
          runCompetingWrite: async () => {
            await versions.savePublishedVersion({
              id: v2Id,
              routineId,
              createdBy: author,
              createdAt: TS,
              name: "Competing v2",
              copyFromVersionId: v1.id,
            });
          },
        });
        const { deps, cookie } = appDeps(interleaved, author, "a@example.com");
        const myCopyUrl = `${BASE}${routineMyCopyPath(routineId)}`;
        const copiesBefore = (
          await storage.first<{ c: number }>(
            `SELECT COUNT(*) AS c FROM practitioner_routines WHERE practitioner_id = ? AND routine_id = ?`,
            [author, routineId],
          )
        )?.c;
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
        expect(save.status).toBe(409);
        expect(((await save.json()) as { error: string }).error).toBe("stale_write");
        const copiesAfter = (
          await storage.first<{ c: number }>(
            `SELECT COUNT(*) AS c FROM practitioner_routines WHERE practitioner_id = ? AND routine_id = ?`,
            [author, routineId],
          )
        )?.c;
        expect(copiesAfter).toBe(copiesBefore);
        expect(
          await new PractitionerRoutinesRepository(storage).findForPractitioner(
            author,
            routineId,
          ),
        ).toBeNull();
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("adopt_community_version: competing community version before replace batch returns 409 stale_write without partial rows", async () => {
      const storage = await open();
      try {
        const { practitionerA: author } = await seedTwoPractitioners(
          asMigratedStorage(storage),
        );
        const routineId = id(`1170-adopt-${label}`);
        const v1 = await publishRoutine(asMigratedStorage(storage), author, {
          routine: `1170-adopt-${label}`,
          draftVersion: `1170-adopt-draft-${label}`,
          row: `1170-adopt-row-${label}`,
          name: "Adopt race v1",
        });
        await new PractitionerRoutinesRepository(storage).saveFrozenCopy({
          id: id(`1170-adopt-copy-${label}`),
          practitionerId: author,
          routineId,
          sourceRoutineVersionId: v1.id,
          savedAt: TS,
          rows: [
            {
              id: id(`1170-adopt-copy-row-${label}`),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: { hold_s: 10, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        });
        const versions = new RoutineVersionsRepository(storage);
        const v2 = await versions.savePublishedVersion({
          id: id(`1170-adopt-v2-${label}`),
          routineId,
          createdBy: author,
          createdAt: TS,
          name: "Adopt race v2",
          copyFromVersionId: v1.id,
        });
        const copyBefore = await new PractitionerRoutinesRepository(
          storage,
        ).findForPractitioner(author, routineId);
        const rowCountBefore = (
          await storage.first<{ c: number }>(
            `SELECT COUNT(*) AS c FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
            [copyBefore!.id],
          )
        )?.c;
        const interleaved = wrapSqlStorageWithBeforeBatchHook(storage, {
          shouldHook: (statements) =>
            batchIncludesReplaceSavedCopyFromPublished(statements) ||
            batchIncludesRoutinePublishedVersionGuard(statements),
          once: true,
          runCompetingWrite: async () => {
            await versions.savePublishedVersion({
              id: id(`1170-adopt-v3-${label}`),
              routineId,
              createdBy: author,
              createdAt: TS,
              name: "Adopt race v3",
              copyFromVersionId: v2.id,
            });
          },
        });
        const { deps, cookie } = appDeps(interleaved, author, "a@example.com");
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
        expect(adopt.status).toBe(409);
        expect(((await adopt.json()) as { error: string }).error).toBe("stale_write");
        const copyAfter = await new PractitionerRoutinesRepository(
          storage,
        ).findForPractitioner(author, routineId);
        expect(copyAfter?.source_routine_version_id).toBe(
          copyBefore?.source_routine_version_id,
        );
        expect(copyAfter?.source_version_number).toBe(
          copyBefore?.source_version_number,
        );
        const rowCountAfter = (
          await storage.first<{ c: number }>(
            `SELECT COUNT(*) AS c FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
            [copyBefore!.id],
          )
        )?.c;
        expect(rowCountAfter).toBe(rowCountBefore);
        const routine = await new RoutinesRepository(storage).findById(routineId);
        expect(routine?.published_version).toBe(3);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("foreign author draft publish matches read response; only stale write is 409", async () => {
      const storage = await open();
      try {
        const { practitionerA, practitionerB } = await seedTwoPractitioners(
          asMigratedStorage(storage),
        );
        const routineId = await seedAuthoringDraft(
          storage,
          practitionerA,
          `foreign-${label}`,
        );
        const { deps: depsB, cookie: cookieB } = appDeps(
          storage,
          practitionerB,
          "b@example.com",
        );
        const readUrl = `${BASE}${routineDetailsPath(routineId)}`;
        const read = await handleRequest(
          new Request(readUrl, { headers: { cookie: cookieB } }),
          depsB,
        );
        const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
        const publish = await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "POST",
              headers: { cookie: cookieB, "content-type": "application/json" },
              body: JSON.stringify({ action: "publish", name: "Foreign publish" }),
            }),
          ),
          depsB,
        );
        expect(publish.status).toBe(read.status);
        expect(await publish.json()).toEqual(await read.json());
        expect(publish.status).not.toBe(409);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("missing routine publish matches read response; only stale write is 409", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(
          storage,
          id(`1170-miss-${label}`),
          `miss-${label}@example.com`,
        );
        await seedApprovedExerciseForBuilder(asMigratedStorage(storage), author);
        const missingId = id(`1170-missing-routine-${label}`);
        const { deps, cookie } = appDeps(storage, author, `miss-${label}@example.com`);
        const readUrl = `${BASE}${routineDetailsPath(missingId)}`;
        const read = await handleRequest(
          new Request(readUrl, { headers: { cookie } }),
          deps,
        );
        const itemUrl = `${BASE}${routineAuthoringItemPath(missingId)}`;
        const publish = await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "POST",
              headers: { cookie, "content-type": "application/json" },
              body: JSON.stringify({ action: "publish", name: "Missing" }),
            }),
          ),
          deps,
        );
        expect(publish.status).toBe(read.status);
        expect(await publish.json()).toEqual(await read.json());
        expect(publish.status).not.toBe(409);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });
  },
);

describe("DIDI-1170 program from routine HTTP stale_write", () => {
  it("maps service stale_write to HTTP 409 on POST /api/me/programs/from-routine", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("1170-prog-http"),
        "prog-http@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      await publishRoutine(storage, author, {
        routine: "1170-prog-http-routine",
        draftVersion: "1170-prog-http-draft",
        row: "1170-prog-http-row",
        name: "Program stale HTTP",
      });
      const { deps, cookie } = appDeps(storage, author, "prog-http@example.com");
      const url = `${BASE}${programsFromRoutinePath()}`;
      const original = ProgramsRepository.prototype.buildCreateBatchStatements;
      ProgramsRepository.prototype.buildCreateBatchStatements = async function () {
        throw new RoutineRepositoryError("Stale write", { code: "stale_write" });
      };
      try {
        const response = await handleRequest(
          new Request(
            url,
            mutatingAppApiRequestInit(url, {
              method: "POST",
              headers: { cookie, "content-type": "application/json" },
              body: JSON.stringify({
                program_id: id("1170-prog-http-prog"),
                routine_id: id("1170-prog-http-routine"),
                source: "community",
                row_ids: [id("1170-prog-http-prow")],
              }),
            }),
          ),
          deps,
        );
        expect(response.status).toBe(409);
        expect(((await response.json()) as { error: string }).error).toBe(
          "stale_write",
        );
        expect(
          await new ProgramsRepository(storage).findById(id("1170-prog-http-prog")),
        ).toBeNull();
      } finally {
        ProgramsRepository.prototype.buildCreateBatchStatements = original;
      }
    } finally {
      storage.close();
    }
  });
});
