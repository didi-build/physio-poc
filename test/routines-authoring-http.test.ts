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
  RoutineVersionsRepository,
} from "../src/storage/repositories/routines.js";
import { ProgramRowsRepository } from "../src/storage/repositories/programs.js";
import { ProgramBuilderService } from "../src/services/programs/index.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedPractitioner,
  TS,
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
