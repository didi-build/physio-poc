import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  ROUTINES_AUTHORING_COLLECTION_PATH,
  routineAuthoringItemPath,
  routineVersionHistoryPath,
} from "../src/routine-authoring-api-paths.js";
import { routineDetailsPath } from "../src/routine-library-api-paths.js";
import {
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutinesRepository,
  ConditionsRepository,
  RoutineVersionsRepository,
  RoutineVersionRowsRepository,
} from "../src/storage/repositories/routines.js";
import { ProgramRowsRepository } from "../src/storage/repositories/programs.js";
import { ProgramBuilderService } from "../src/services/programs/index.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
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
const physioMcpToolsGolden = JSON.parse(
  readFileSync(
    join(process.cwd(), "test/fixtures/physio-mcp-tools.golden.json"),
    "utf8",
  ),
) as { name: string }[];

const BASE = "https://physio.test.example";
const BODY_REGION_KNEE = "br-knee";

function appDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
) {
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

describe("Routine authoring HTTP (DIDI-1021)", () => {
  it("creates an author-only draft, supports autosave, publish, and draft details", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-a"),
        "auth-a@example.com",
      );
      const other = await seedPractitioner(storage, id("auth-b"), "auth-b@example.com");
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDeps(storage, author, "auth-a@example.com");

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
      const body = (await created.json()) as { routine_id: string };
      const routineId = body.routine_id;

      const patchUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      const patched = await handleRequest(
        new Request(
          patchUrl,
          mutatingAppApiRequestInit(patchUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              name: "Knee starter draft",
              rows: rowPayload(),
            }),
          }),
        ),
        deps,
      );
      expect(patched.status).toBe(200);

      const authorDetails = await handleRequest(
        new Request(`${BASE}${routineDetailsPath(routineId)}`, {
          headers: { cookie },
        }),
        deps,
      );
      expect(authorDetails.status).toBe(200);
      const details = (await authorDetails.json()) as {
        is_draft: boolean;
        draft: { name: string | null; rows: unknown[] } | null;
      };
      expect(details.is_draft).toBe(true);
      expect(details.draft?.name).toBe("Knee starter draft");
      expect(details.draft?.rows).toHaveLength(1);

      const { deps: otherDeps, cookie: otherCookie } = appDeps(
        storage,
        other,
        "auth-b@example.com",
      );
      const otherDetails = await handleRequest(
        new Request(`${BASE}${routineDetailsPath(routineId)}`, {
          headers: { cookie: otherCookie },
        }),
        otherDeps,
      );
      expect(otherDetails.status).toBe(404);

      const publishUrl = patchUrl;
      const published = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "publish", name: "Knee starter" }),
          }),
        ),
        deps,
      );
      expect(published.status).toBe(200);
      const publishedBody = (await published.json()) as { version_number: number };
      expect(publishedBody.version_number).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("returns publish_validation_failed without persisting live version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage, id("auth-val"), "val@example.com");
      const { deps, cookie } = appDeps(storage, author, "val@example.com");
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
      const { routine_id: routineId } = (await created.json()) as {
        routine_id: string;
      };
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      const publish = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "publish" }),
          }),
        ),
        deps,
      );
      expect(publish.status).toBe(400);
      const err = (await publish.json()) as {
        error: string;
        validation_issues: string[];
      };
      expect(err.error).toBe("publish_validation_failed");
      expect(err.validation_issues).toEqual(
        expect.arrayContaining(["missing_name", "missing_exercises"]),
      );
      expect(await new RoutinesRepository(storage).findById(routineId)).toMatchObject({
        published_version: null,
      });
    } finally {
      storage.close();
    }
  });

  it("discards draft with undo and cancels untouched draft on DELETE", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-disc"),
        "disc@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDeps(storage, author, "disc@example.com");
      const createUrl = `${BASE}${ROUTINES_AUTHORING_COLLECTION_PATH}`;
      const untouched = await handleRequest(
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
      const untouchedId = ((await untouched.json()) as { routine_id: string })
        .routine_id;
      const cancelUrl = `${BASE}${routineAuthoringItemPath(untouchedId)}`;
      const cancelled = await handleRequest(
        new Request(
          cancelUrl,
          mutatingAppApiRequestInit(cancelUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(cancelled.status).toBe(200);
      expect(await new RoutinesRepository(storage).findById(untouchedId)).toBeNull();

      const touchedOnly = await handleRequest(
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
      const touchedOnlyId = ((await touchedOnly.json()) as { routine_id: string })
        .routine_id;
      const touchedOnlyUrl = `${BASE}${routineAuthoringItemPath(touchedOnlyId)}`;
      await handleRequest(
        new Request(
          touchedOnlyUrl,
          mutatingAppApiRequestInit(touchedOnlyUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ name: "Touched for cancel" }),
          }),
        ),
        deps,
      );
      const cancelTouched = await handleRequest(
        new Request(
          touchedOnlyUrl,
          mutatingAppApiRequestInit(touchedOnlyUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(cancelTouched.status).toBe(400);
      const cancelTouchedBody = (await cancelTouched.json()) as { error: string };
      expect(cancelTouchedBody.error).toBe("draft_not_touchable");
      const routines = new RoutinesRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const versionRows = new RoutineVersionRowsRepository(storage);
      expect(await routines.findById(touchedOnlyId)).not.toBeNull();
      const draftVersion = await versions.findDraftForRoutine(touchedOnlyId);
      expect(draftVersion).not.toBeNull();
      expect(await versionRows.listForVersion(draftVersion!.id)).toHaveLength(0);

      const rowsOnly = await handleRequest(
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
      const rowsOnlyId = ((await rowsOnly.json()) as { routine_id: string }).routine_id;
      const rowsOnlyUrl = `${BASE}${routineAuthoringItemPath(rowsOnlyId)}`;
      await handleRequest(
        new Request(
          rowsOnlyUrl,
          mutatingAppApiRequestInit(rowsOnlyUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ rows: rowPayload() }),
          }),
        ),
        deps,
      );
      const cancelRowsOnly = await handleRequest(
        new Request(
          rowsOnlyUrl,
          mutatingAppApiRequestInit(rowsOnlyUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(cancelRowsOnly.status).toBe(400);
      expect(((await cancelRowsOnly.json()) as { error: string }).error).toBe(
        "draft_not_touchable",
      );
      expect(await routines.findById(rowsOnlyId)).not.toBeNull();
      const rowsOnlyDraft = await versions.findDraftForRoutine(rowsOnlyId);
      expect(rowsOnlyDraft).not.toBeNull();
      expect(await versionRows.listForVersion(rowsOnlyDraft!.id)).toHaveLength(1);

      const whoOnly = await handleRequest(
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
      const whoOnlyId = ((await whoOnly.json()) as { routine_id: string }).routine_id;
      const whoOnlyUrl = `${BASE}${routineAuthoringItemPath(whoOnlyId)}`;
      await handleRequest(
        new Request(
          whoOnlyUrl,
          mutatingAppApiRequestInit(whoOnlyUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ who_its_for: "General strengthening" }),
          }),
        ),
        deps,
      );
      const cancelWhoOnly = await handleRequest(
        new Request(
          whoOnlyUrl,
          mutatingAppApiRequestInit(whoOnlyUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(cancelWhoOnly.status).toBe(400);
      expect(((await cancelWhoOnly.json()) as { error: string }).error).toBe(
        "draft_not_touchable",
      );
      expect(await routines.findById(whoOnlyId)).not.toBeNull();

      const condOnly = await handleRequest(
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
      const condOnlyId = ((await condOnly.json()) as { routine_id: string }).routine_id;
      const condOnlyUrl = `${BASE}${routineAuthoringItemPath(condOnlyId)}`;
      const condId = id("auth-touch-cond");
      await new ConditionsRepository(storage).insert({
        id: condId,
        label: "Arthritis",
      });
      await handleRequest(
        new Request(
          condOnlyUrl,
          mutatingAppApiRequestInit(condOnlyUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ condition_id: condId }),
          }),
        ),
        deps,
      );
      const cancelCondOnly = await handleRequest(
        new Request(
          condOnlyUrl,
          mutatingAppApiRequestInit(condOnlyUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(cancelCondOnly.status).toBe(400);
      expect(((await cancelCondOnly.json()) as { error: string }).error).toBe(
        "draft_not_touchable",
      );
      expect(await routines.findById(condOnlyId)).not.toBeNull();

      const touched = await handleRequest(
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
      const touchedId = ((await touched.json()) as { routine_id: string }).routine_id;
      const itemUrl = `${BASE}${routineAuthoringItemPath(touchedId)}`;
      await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ name: "Will discard", rows: rowPayload() }),
          }),
        ),
        deps,
      );
      const discard = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "discard_draft" }),
          }),
        ),
        deps,
      );
      expect(discard.status).toBe(200);
      const undoPayload = (await discard.json()) as { undo: unknown };
      expect(await new RoutinesRepository(storage).findById(touchedId)).toBeNull();
      const undo = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "undo_draft_discard",
              undo: undoPayload.undo,
            }),
          }),
        ),
        deps,
      );
      expect(undo.status).toBe(200);
      expect(await new RoutinesRepository(storage).findById(touchedId)).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("hides empty author drafts from non-author publish validation", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-empty-a"),
        "empty-a@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("auth-empty-b"),
        "empty-b@example.com",
      );
      const { deps, cookie } = appDeps(storage, author, "empty-a@example.com");
      const { deps: otherDeps, cookie: otherCookie } = appDeps(
        storage,
        other,
        "empty-b@example.com",
      );
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
      const routineId = ((await created.json()) as { routine_id: string }).routine_id;
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      const publish = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie: otherCookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "publish" }),
          }),
        ),
        otherDeps,
      );
      expect(publish.status).toBe(404);
      const body = (await publish.json()) as { error: string };
      expect(body.error).toBe("routine_not_found");
      expect(await new RoutinesRepository(storage).findById(routineId)).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("returns 404 routine_not_found for non-authors on every draft mutation", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-hide-a"),
        "hide-a@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("auth-hide-b"),
        "hide-b@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDeps(storage, author, "hide-a@example.com");
      const { deps: otherDeps, cookie: otherCookie } = appDeps(
        storage,
        other,
        "hide-b@example.com",
      );
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
      const routineId = ((await created.json()) as { routine_id: string }).routine_id;
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ name: "Secret draft", rows: rowPayload() }),
          }),
        ),
        deps,
      );
      const routines = new RoutinesRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const versionRows = new RoutineVersionRowsRepository(storage);
      const snapshot = async () => ({
        routine: await routines.findById(routineId),
        draft: await versions.findDraftForRoutine(routineId),
        rowCount: (
          await versionRows.listForVersion(
            (await versions.findDraftForRoutine(routineId))!.id,
          )
        ).length,
      });
      const before = await snapshot();

      const missingId = id("auth-hide-missing");
      const missingGet = await handleRequest(
        new Request(`${BASE}${routineDetailsPath(missingId)}`, {
          headers: { cookie: otherCookie },
        }),
        otherDeps,
      );
      expect(missingGet.status).toBe(404);
      const missingNotFoundBody = await missingGet.text();

      const expect404 = async (response: Response) => {
        expect(response.status).toBe(404);
        expect(await response.text()).toBe(missingNotFoundBody);
        expect(await snapshot()).toEqual(before);
      };

      await expect404(
        await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "PATCH",
              headers: { cookie: otherCookie, "content-type": "application/json" },
              body: JSON.stringify({ name: "Stolen" }),
            }),
          ),
          otherDeps,
        ),
      );
      await expect404(
        await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "POST",
              headers: { cookie: otherCookie, "content-type": "application/json" },
              body: JSON.stringify({ action: "publish", name: "Stolen" }),
            }),
          ),
          otherDeps,
        ),
      );
      await expect404(
        await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "POST",
              headers: { cookie: otherCookie, "content-type": "application/json" },
              body: JSON.stringify({ action: "discard_draft" }),
            }),
          ),
          otherDeps,
        ),
      );
      await expect404(
        await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "DELETE",
              headers: { cookie: otherCookie },
            }),
          ),
          otherDeps,
        ),
      );
      await expect404(
        await handleRequest(
          new Request(
            itemUrl,
            mutatingAppApiRequestInit(itemUrl, {
              method: "POST",
              headers: { cookie: otherCookie, "content-type": "application/json" },
              body: JSON.stringify({
                action: "undo_draft_discard",
                undo: { practitioner_id: other, routine_id: routineId },
              }),
            }),
          ),
          otherDeps,
        ),
      );
    } finally {
      storage.close();
    }
  });

  it("returns 401 without a session on every authoring mutation", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-401"),
        "auth401@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDeps(storage, author, "auth401@example.com");
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
      const routineId = ((await created.json()) as { routine_id: string }).routine_id;
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              name: "Published for 401 guards",
              rows: rowPayload(),
            }),
          }),
        ),
        deps,
      );
      await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "publish",
              name: "Published for 401 guards",
            }),
          }),
        ),
        deps,
      );
      const versionCountBefore = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ?",
        [routineId],
      );
      const routineCount = await storage.first<{ c: number }>(
        "SELECT COUNT(*) AS c FROM routines",
      );
      const countBefore = routineCount?.c ?? 0;
      const versionsBefore = versionCountBefore?.c ?? 0;

      const noCookie = (url: string, init: RequestInit) =>
        handleRequest(new Request(url, mutatingAppApiRequestInit(url, init)), deps);

      const createNoSession = await noCookie(createUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body_region_id: BODY_REGION_KNEE }),
      });
      expect(createNoSession.status).toBe(401);

      const patchNoSession = await noCookie(itemUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      });
      expect(patchNoSession.status).toBe(401);

      const deleteNoSession = await noCookie(itemUrl, { method: "DELETE" });
      expect(deleteNoSession.status).toBe(401);

      const publishNoSession = await noCookie(itemUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      expect(publishNoSession.status).toBe(401);

      const discardNoSession = await noCookie(itemUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "discard_draft" }),
      });
      expect(discardNoSession.status).toBe(401);

      const undoNoSession = await noCookie(itemUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "undo_draft_discard", undo: {} }),
      });
      expect(undoNoSession.status).toBe(401);

      const saveCommunityNoSession = await noCookie(itemUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_community_version",
          expected_published_version: 1,
          name: "Nope v2",
          rows: rowPayload(40),
        }),
      });
      expect(saveCommunityNoSession.status).toBe(401);

      const restoreNoSession = await noCookie(itemUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "restore_version",
          restore_from_version_number: 1,
        }),
      });
      expect(restoreNoSession.status).toBe(401);

      const countAfter = (
        await storage.first<{ c: number }>("SELECT COUNT(*) AS c FROM routines")
      )?.c;
      expect(countAfter).toBe(countBefore);
      const versionsAfter = (
        await storage.first<{ c: number }>(
          "SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ?",
          [routineId],
        )
      )?.c;
      expect(versionsAfter).toBe(versionsBefore);
    } finally {
      storage.close();
    }
  });

  it("edit for everyone and restore add versions without mutating sent programs or saved copies", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author, practitionerB: saver } =
        await seedTwoPractitioners(storage);
      const routineId = id("auth-edit-routine");
      const v1 = await publishRoutine(storage, author, {
        routine: "auth-edit-routine",
        draftVersion: "auth-edit-draft",
        row: "auth-edit-row",
        name: "Auth edit v1",
        hold_s: 25,
      });

      const my = new PractitionerRoutinesRepository(storage);
      const copy = await my.saveFrozenCopy({
        id: id("auth-edit-copy"),
        practitionerId: saver,
        routineId,
        sourceRoutineVersionId: v1.id,
        savedAt: TS,
        rows: [
          {
            id: id("auth-edit-copy-row"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: { hold_s: 25, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });

      const programId = id("auth-edit-prog");
      const programService = new ProgramBuilderService(storage);
      await programService.createProgramFromRoutine(author, {
        programId,
        routineId,
        source: "community",
        rowIds: [id("auth-edit-prog-row")],
      });
      const copyRowBefore = (
        await new PractitionerRoutineRowsRepository(storage).listForCopy(copy.id)
      )[0]?.params_json;
      const progRowBefore = (
        await new ProgramRowsRepository(storage).listForProgram(programId)
      )[0]?.params_json;

      const { deps, cookie } = appDeps(storage, author, "a@example.com");
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      const v2Response = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "save_community_version",
              expected_published_version: 1,
              name: "Auth edit v2",
              change_summary: "Hold tweak",
              rows: rowPayload(45),
            }),
          }),
        ),
        deps,
      );
      expect(v2Response.status).toBe(200);

      const historyUrl = `${BASE}${routineVersionHistoryPath(routineId)}`;
      const history = await handleRequest(
        new Request(historyUrl, { headers: { cookie } }),
        deps,
      );
      const historyBody = (await history.json()) as {
        live_version_number: number;
        versions: { version_number: number; is_live: boolean }[];
      };
      expect(historyBody.live_version_number).toBe(2);
      expect(
        historyBody.versions.some((v) => v.version_number === 1 && !v.is_live),
      ).toBe(true);

      const restore = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "restore_version",
              restore_from_version_number: 1,
            }),
          }),
        ),
        deps,
      );
      expect(restore.status).toBe(200);
      const versions = await new RoutineVersionsRepository(
        storage,
      ).listPublishedVersionsForRoutine(routineId);
      expect(versions).toHaveLength(3);
      expect(versions[0]?.version_number).toBe(3);

      const copyRowAfter = (
        await new PractitionerRoutineRowsRepository(storage).listForCopy(copy.id)
      )[0]?.params_json;
      const progRowAfter = (
        await new ProgramRowsRepository(storage).listForProgram(programId)
      )[0]?.params_json;
      expect(copyRowAfter).toBe(copyRowBefore);
      expect(progRowAfter).toBe(progRowBefore);
      expect(copy.source_version_number).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("rejects tampered undo with a draft exercise version and leaves the DB unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-undo-bad-ver"),
        "undo-bad@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDeps(storage, author, "undo-bad@example.com");
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
      const routineId = ((await created.json()) as { routine_id: string }).routine_id;
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ name: "Undo guard", rows: rowPayload() }),
          }),
        ),
        deps,
      );
      const discard = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "discard_draft" }),
          }),
        ),
        deps,
      );
      const undoPayload = (await discard.json()) as {
        undo: {
          practitioner_id: string;
          routine_id: string;
          snapshot: { rows: { exercise_version_id: string }[] };
        };
      };
      const draftVerId = id("auth-undo-draft-ver");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: draftVerId,
          exercise_id: FIXTURE_EXERCISE_ID,
          version_number: 2,
          status: "draft",
        }),
      );
      undoPayload.undo.snapshot.rows[0]!.exercise_version_id = draftVerId;
      const countBefore = (
        await storage.first<{ c: number }>("SELECT COUNT(*) AS c FROM routines")
      )?.c;
      const undo = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "undo_draft_discard",
              undo: undoPayload.undo,
            }),
          }),
        ),
        deps,
      );
      expect(undo.status).toBe(404);
      expect(((await undo.json()) as { error: string }).error).toBe(
        "exercise_not_found",
      );
      expect(
        (await storage.first<{ c: number }>("SELECT COUNT(*) AS c FROM routines"))?.c,
      ).toBe(countBefore);
      expect(await new RoutinesRepository(storage).findById(routineId)).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects tampered undo with mismatched exercise id and leaves the DB unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-undo-bad-ex"),
        "undo-ex@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const otherExerciseId = id("auth-undo-other-ex");
      await storage.run(
        "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
        [otherExerciseId, "stretch", author, TS],
      );
      const { deps, cookie } = appDeps(storage, author, "undo-ex@example.com");
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
      const routineId = ((await created.json()) as { routine_id: string }).routine_id;
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ name: "Mismatch guard", rows: rowPayload() }),
          }),
        ),
        deps,
      );
      const discard = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "discard_draft" }),
          }),
        ),
        deps,
      );
      const undoPayload = (await discard.json()) as {
        undo: {
          snapshot: { rows: { exercise_id: string; exercise_version_id: string }[] };
        };
      };
      undoPayload.undo.snapshot.rows[0]!.exercise_id = otherExerciseId;
      const countBefore = (
        await storage.first<{ c: number }>("SELECT COUNT(*) AS c FROM routines")
      )?.c;
      const undo = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "undo_draft_discard",
              undo: undoPayload.undo,
            }),
          }),
        ),
        deps,
      );
      expect(undo.status).toBe(404);
      expect(((await undo.json()) as { error: string }).error).toBe(
        "exercise_not_found",
      );
      expect(
        (await storage.first<{ c: number }>("SELECT COUNT(*) AS c FROM routines"))?.c,
      ).toBe(countBefore);
    } finally {
      storage.close();
    }
  });

  it("rejects undo on a never-existing routine id with GET-identical 404 and no create", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-undo-never"),
        "undo-never@example.com",
      );
      const { deps, cookie } = appDeps(storage, author, "undo-never@example.com");
      const neverId = id("auth-never-routine");
      const itemUrl = `${BASE}${routineAuthoringItemPath(neverId)}`;
      const missingGet = await handleRequest(
        new Request(`${BASE}${routineDetailsPath(neverId)}`, { headers: { cookie } }),
        deps,
      );
      expect(missingGet.status).toBe(404);
      const missingBody = await missingGet.text();
      const countBefore = (
        await storage.first<{ c: number }>("SELECT COUNT(*) AS c FROM routines")
      )?.c;
      const undo = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "undo_draft_discard",
              undo: {
                practitioner_id: author,
                routine_id: neverId,
                snapshot: {
                  routine_id: neverId,
                  draft_version_id: id("auth-never-draft-ver"),
                  created_at: TS,
                  draft_updated_at: TS,
                  body_region_id: BODY_REGION_KNEE,
                  condition_id: null,
                  who_its_for: null,
                  name: "Forged",
                  rows: [
                    {
                      position: 0,
                      exercise_id: FIXTURE_EXERCISE_ID,
                      exercise_version_id: FIXTURE_VERSION_ID,
                      prescription_type: "stretching",
                      params_json: JSON.stringify({
                        hold_s: 30,
                        per_day: { min: 1, max: 2 },
                        days_per_week: 7,
                      }),
                    },
                  ],
                },
              },
            }),
          }),
        ),
        deps,
      );
      expect(undo.status).toBe(404);
      expect(await undo.text()).toBe(missingBody);
      expect(
        (await storage.first<{ c: number }>("SELECT COUNT(*) AS c FROM routines"))?.c,
      ).toBe(countBefore);
    } finally {
      storage.close();
    }
  });

  it("rejects publish when a draft row pins an unapproved exercise version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-pub-bad"),
        "pub-bad@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const routineId = id("auth-pub-bad-routine");
      const draftVerId = id("auth-pub-bad-draft-ver");
      await routines.createDraft({
        id: routineId,
        draftVersionId: draftVerId,
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
        name: "Bad publish row",
      });
      const unapprovedVer = id("auth-pub-unapproved-ev");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: unapprovedVer,
          exercise_id: FIXTURE_EXERCISE_ID,
          version_number: 2,
          status: "draft",
        }),
      );
      await rows.replaceDraftRow({
        id: id("auth-pub-bad-row"),
        routineId,
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: unapprovedVer,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const { deps, cookie } = appDeps(storage, author, "pub-bad@example.com");
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      const versionsBefore = await versions.listPublishedVersionsForRoutine(routineId);
      const publish = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "publish", name: "Bad publish row" }),
          }),
        ),
        deps,
      );
      expect(publish.status).toBe(404);
      expect(((await publish.json()) as { error: string }).error).toBe(
        "exercise_not_found",
      );
      expect(await routines.findById(routineId)).toMatchObject({
        published_version: null,
      });
      expect(await versions.listPublishedVersionsForRoutine(routineId)).toEqual(
        versionsBefore,
      );
    } finally {
      storage.close();
    }
  });

  it("returns 409 stale_write on save_community_version when expected_published_version is stale", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("auth-stale"),
        "stale@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const routineId = id("auth-stale-routine");
      await publishRoutine(storage, author, {
        routine: "auth-stale-routine",
        draftVersion: "auth-stale-draft",
        row: "auth-stale-row",
        name: "Stale test v1",
      });
      const { deps, cookie } = appDeps(storage, author, "stale@example.com");
      const itemUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      const versionsBefore = (
        await storage.first<{ c: number }>(
          "SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ? AND status = 'published'",
          [routineId],
        )
      )?.c;
      const save = await handleRequest(
        new Request(
          itemUrl,
          mutatingAppApiRequestInit(itemUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              action: "save_community_version",
              expected_published_version: 99,
              name: "Stale v2",
              rows: rowPayload(33),
            }),
          }),
        ),
        deps,
      );
      expect(save.status).toBe(409);
      expect(((await save.json()) as { error: string }).error).toBe("stale_write");
      const versionsAfter = (
        await storage.first<{ c: number }>(
          "SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ? AND status = 'published'",
          [routineId],
        )
      )?.c;
      expect(versionsAfter).toBe(versionsBefore);
    } finally {
      storage.close();
    }
  });

  it("MCP tool list has no routine create/edit/publish/restore tools", () => {
    const names = physioMcpToolsGolden.map((tool) => tool.name);
    const blocked = [
      "create_routine",
      "edit_routine",
      "publish_routine",
      "restore_routine",
      "discard_routine",
    ];
    for (const tool of blocked) {
      expect(names).not.toContain(tool);
    }
    expect(names).toContain("search_routines");
  });
});
