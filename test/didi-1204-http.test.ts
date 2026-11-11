import { describe, expect, it } from "vitest";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
  MIGRATION_0008_ID,
} from "../src/storage/migrations/apply.js";
import {
  BODY_REGIONS_LIST_PATH,
  routineDetailsPath,
} from "../src/routine-library-api-paths.js";
import { ROUTINES_AUTHORING_COLLECTION_PATH } from "../src/routine-authoring-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  MIGRATION_0007_SQL,
  MIGRATION_0008_SQL,
  openMigratedDatabase,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import {
  publishRoutine,
  seedApprovedExerciseForBuilder,
} from "./helpers/from-routine-http-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  ConditionsRepository,
  RoutineVersionRowsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import { id } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const BODY_REGION_KNEE = "br-knee";

type MigratedStorage = Awaited<ReturnType<typeof openMigratedDatabase>>;

function asMigratedStorage(storage: SqlStoragePort): MigratedStorage {
  return storage as MigratedStorage;
}

async function openMigratedD1SqlStorage(): Promise<D1SqlStorage> {
  const d1 = createFakePhysioD1Database();
  const sql = new D1SqlStorage(d1);
  await applyMigration(sql, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(sql, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(sql, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(sql, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(sql, MIGRATION_0007_ID, MIGRATION_0007_SQL);
  await applyMigration(sql, MIGRATION_0008_ID, MIGRATION_0008_SQL);
  return sql;
}

type StorageCase = {
  label: string;
  open: () => Promise<SqlStoragePort & { close?: () => void }>;
};

const NODE_AND_D1: StorageCase[] = [
  { label: "BetterSqliteStorage", open: () => openMigratedDatabase() },
  { label: "D1SqlStorage fake", open: () => openMigratedD1SqlStorage() },
];

function appDeps(storage: SqlStoragePort, practitionerId: string, email: string) {
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
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

describe.each(NODE_AND_D1)(
  "DIDI-1204 body regions and routine details ids (%s)",
  ({ open }) => {
    it("lists body regions with id and label in DB order", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(storage, id("d1204-a"), "a@example.com");
        const { deps, cookie } = appDeps(storage, author, "a@example.com");
        const response = await handleRequest(
          new Request(`${BASE}${BODY_REGIONS_LIST_PATH}`, {
            method: "GET",
            headers: { cookie },
          }),
          deps,
        );
        expect(response.status).toBe(200);
        const body = (await response.json()) as { id: string; label: string }[];
        expect(body).toEqual([
          { id: "br-ankle", label: "ankle" },
          { id: "br-hip", label: "hip" },
          { id: "br-knee", label: "knee" },
        ]);
        for (const region of body) {
          expect(Object.keys(region).sort()).toEqual(["id", "label"]);
        }
      } finally {
        storage.close?.();
      }
    });

    it("returns body_region_id on published and author draft details; condition_id when set", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(
          storage,
          id("d1204-author"),
          "a@example.com",
        );
        const other = await seedPractitioner(
          storage,
          id("d1204-other"),
          "b@example.com",
        );
        await seedApprovedExerciseForBuilder(asMigratedStorage(storage), author);
        const condId = id("d1204-cond");
        await new ConditionsRepository(storage).insert({
          id: condId,
          label: "Arthritis",
        });
        const publishedId = id("d1204-published");
        await publishRoutine(asMigratedStorage(storage), author, {
          routine: "d1204-published",
          draftVersion: "d1204-published-draft",
          row: "d1204-published-row",
          name: "Published knee",
        });
        await storage.run(`UPDATE routines SET condition_id = ? WHERE id = ?`, [
          condId,
          publishedId,
        ]);

        const draftId = id("d1204-draft");
        await new RoutinesRepository(storage).createDraft({
          id: draftId,
          draftVersionId: id("d1204-draft-ver"),
          createdBy: author,
          createdAt: TS,
          bodyRegionId: BODY_REGION_KNEE,
        });
        await new RoutineVersionRowsRepository(storage).replaceDraftRow({
          id: id("d1204-draft-row"),
          routineId: draftId,
          authorId: author,
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          draftUpdatedAt: TS,
        });

        const { deps, cookie } = appDeps(storage, author, "a@example.com");
        const list = (await handleRequest(
          new Request(`${BASE}${BODY_REGIONS_LIST_PATH}`, { headers: { cookie } }),
          deps,
        ).then((r) => r.json())) as { id: string }[];
        const regionIds = new Set(list.map((r) => r.id));

        const publishedRes = await handleRequest(
          new Request(`${BASE}${routineDetailsPath(publishedId)}`, {
            headers: { cookie },
          }),
          deps,
        );
        expect(publishedRes.status).toBe(200);
        const published = (await publishedRes.json()) as {
          is_draft: boolean;
          body_region_id: string;
          condition_id: string | null;
        };
        expect(published.is_draft).toBe(false);
        expect(regionIds.has(published.body_region_id)).toBe(true);
        expect(published.body_region_id).toBe(BODY_REGION_KNEE);
        expect(published.condition_id).toBe(condId);

        const draftRes = await handleRequest(
          new Request(`${BASE}${routineDetailsPath(draftId)}`, {
            headers: { cookie },
          }),
          deps,
        );
        expect(draftRes.status).toBe(200);
        const draft = (await draftRes.json()) as {
          is_draft: boolean;
          body_region_id: string;
          condition_id: string | null;
        };
        expect(draft.is_draft).toBe(true);
        expect(regionIds.has(draft.body_region_id)).toBe(true);
        expect(draft.body_region_id).toBe(BODY_REGION_KNEE);
        expect(draft.condition_id).toBeNull();

        const { deps: otherDeps, cookie: otherCookie } = appDeps(
          storage,
          other,
          "b@example.com",
        );
        const otherDraft = await handleRequest(
          new Request(`${BASE}${routineDetailsPath(draftId)}`, {
            headers: { cookie: otherCookie },
          }),
          otherDeps,
        );
        expect(otherDraft.status).toBe(404);
        await expect(otherDraft.json()).resolves.toMatchObject({
          error: "routine_not_found",
        });
      } finally {
        storage.close?.();
      }
    });

    it("returns 401 without a session on GET body-regions and routine details", async () => {
      const storage = await open();
      try {
        const author = await seedPractitioner(
          storage,
          id("d1204-401-a"),
          "a@example.com",
        );
        await seedApprovedExerciseForBuilder(asMigratedStorage(storage), author);
        const routineId = id("d1204-401");
        await publishRoutine(asMigratedStorage(storage), author, {
          routine: "d1204-401",
          draftVersion: "d1204-401-draft",
          row: "d1204-401-row",
          name: "401 guard",
        });
        const { deps } = appDeps(storage, author, "a@example.com");

        const list = await handleRequest(
          new Request(`${BASE}${BODY_REGIONS_LIST_PATH}`, { method: "GET" }),
          deps,
        );
        expect(list.status).toBe(401);

        const detail = await handleRequest(
          new Request(`${BASE}${routineDetailsPath(routineId)}`, { method: "GET" }),
          deps,
        );
        expect(detail.status).toBe(401);
      } finally {
        storage.close?.();
      }
    });
  },
);

describe("DIDI-1204 body regions (authoring draft via HTTP)", () => {
  it("includes body_region_id on draft details created through the authoring API", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("d1204-http"),
        "http@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDeps(storage, author, "http@example.com");
      const createUrl = `${BASE}${ROUTINES_AUTHORING_COLLECTION_PATH}`;
      const created = await handleRequest(
        new Request(
          createUrl,
          mutatingAppApiRequestInit(createUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ body_region_id: BODY_REGION_KNEE }),
          }),
        ),
        deps,
      );
      expect(created.status).toBe(201);
      const { routine_id: routineId } = (await created.json()) as {
        routine_id: string;
      };

      const detailsRes = await handleRequest(
        new Request(`${BASE}${routineDetailsPath(routineId)}`, { headers: { cookie } }),
        deps,
      );
      const details = (await detailsRes.json()) as {
        is_draft: boolean;
        body_region_id: string;
        condition_id: string | null;
      };
      expect(details.is_draft).toBe(true);
      expect(details.body_region_id).toBe(BODY_REGION_KNEE);
      expect(details.condition_id).toBeNull();
    } finally {
      storage.close();
    }
  });
});
