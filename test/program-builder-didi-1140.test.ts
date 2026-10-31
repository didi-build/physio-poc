import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import {
  computeShareLinkStatus,
  ProgramBuilderService,
} from "../src/services/programs/program-builder-service.js";
import {
  ProgramsRepository,
  ProgramRowsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import {
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";

const BODY_REGION_KNEE = "br-knee";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
  versionInsertBindings,
  VERSION_INSERT_SQL,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  programByCodePath,
  programPath,
  programRowPath,
  programsCollectionPath,
} from "./helpers/program-builder-http-paths.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  CANONICAL_INVALID_INPUT_QUERY_GUARD_HEADERS,
  INVALID_INPUT_QUERY_GUARD_BODY,
  practitionerIdQuerySuffix,
  practitionerUnderscoreIdQuerySuffix,
  sortedHeaderEntries,
} from "./helpers/invalid-input-query-guard.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { programBuilderHttpRouteCases } from "./helpers/program-builder-http-route-cases.js";

const BASE = "https://physio.test.example";

const PROGRAM_NOT_FOUND_BODY = {
  error: "program_not_found",
  message: "Program not found",
} as const;

const INVALID_INPUT_BODY = {
  error: "invalid_input",
  message: "invalid_input",
} as const;

const JSON_HEADERS: ReadonlyArray<[string, string]> = [
  ["content-type", "application/json"],
];

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

function authedGet(url: string, cookie: string): Request {
  return new Request(url, { headers: { cookie } });
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

async function seedSecondApprovedVersion(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  versionId: string,
  versionNumber: number,
): Promise<void> {
  await storage.run(
    VERSION_INSERT_SQL,
    versionInsertBindings({
      id: versionId,
      version_number: versionNumber,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title: `Heel raise v${versionNumber}`,
    }),
  );
}

describe("DIDI-1140 program API fields and routes", () => {
  it("GET by-code returns the same view as GET by id for the owner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-by-code-view");
      const service = new ProgramBuilderService(storage);
      const created = await service.createProgram(practitionerId, { programId });
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const byId = await handleRequest(
        authedGet(`${BASE}${programPath(programId)}`, cookie),
        deps,
      );
      const byCode = await handleRequest(
        authedGet(`${BASE}${programByCodePath(created.program.code)}`, cookie),
        deps,
      );
      expect(byId.status).toBe(200);
      expect(byCode.status).toBe(200);
      expect(await byCode.json()).toEqual(await byId.json());
    } finally {
      storage.close();
    }
  });

  it("returns identical program_not_found for missing, foreign, soft-deleted and invalid by-code lookups", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("1140-by-code-b");
      await seedPractitioner(storage, practitionerB, "b1140@example.com");
      const programId = id("prog-1140-code");
      const service = new ProgramBuilderService(storage);
      const created = await service.createProgram(practitionerA, { programId });
      await new ProgramsRepository(storage).create({
        id: id("prog-lenient-trap"),
        createdBy: practitionerA,
        createdAt: TS,
        code: "PRG-PRG7",
        name: "Lenient trap",
      });
      await service.deleteProgram(practitionerA, programId);

      const { deps: depsA, cookie: cookieA } = apiDeps(storage, practitionerA);
      const { deps: depsB, cookie: cookieB } = apiDeps(storage, practitionerB);

      const cases = [
        { cookie: cookieB, code: created.program.code, label: "foreign" },
        { cookie: cookieA, code: "PRG-NOMATCH", label: "missing" },
        { cookie: cookieA, code: created.program.code, label: "soft-deleted" },
        { cookie: cookieA, code: "PRG7", label: "lenient-only-code" },
        { cookie: cookieA, code: "not-a-code", label: "invalid-format" },
      ];

      let reference: {
        status: number;
        headers: [string, string][];
        body: string;
      } | null = null;
      for (const probe of cases) {
        const response = await handleRequest(
          authedGet(`${BASE}${programByCodePath(probe.code)}`, probe.cookie),
          probe.cookie === cookieA ? depsA : depsB,
        );
        expect(response.status, probe.label).toBe(404);
        const body = await response.text();
        expect(JSON.parse(body)).toEqual(PROGRAM_NOT_FOUND_BODY);
        const headers = sortedHeaderEntries(response);
        expect(headers).toEqual([...JSON_HEADERS]);
        if (!reference) {
          reference = { status: response.status, headers, body };
        } else {
          expect(body).toBe(reference.body);
          expect(headers).toEqual(reference.headers);
        }
      }
    } finally {
      storage.close();
    }
  });

  it("A cannot read B program via by-code and B fields never appear in A list", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("1140-list-b");
      await seedPractitioner(storage, practitionerB, "listb@example.com");
      const service = new ProgramBuilderService(storage);
      const programA = await service.createProgram(practitionerA, {
        programId: id("prog-a-1140"),
      });
      const programB = await service.createProgram(practitionerB, {
        programId: id("prog-b-1140"),
      });
      const { deps: depsA, cookie: cookieA } = apiDeps(storage, practitionerA);
      const byCodeB = await handleRequest(
        authedGet(`${BASE}${programByCodePath(programB.program.code)}`, cookieA),
        depsA,
      );
      expect(byCodeB.status).toBe(404);
      const listA = await handleRequest(
        authedGet(`${BASE}${programsCollectionPath()}`, cookieA),
        depsA,
      );
      const payload = (await listA.json()) as { items: { code: string }[] };
      expect(payload.items.map((item) => item.code)).toEqual([programA.program.code]);
      expect(payload.items.some((item) => item.code === programB.program.code)).toBe(
        false,
      );
    } finally {
      storage.close();
    }
  });

  it("exposes last_sent_at from programs.published_at and keeps it with unpublished changes", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const programId = id("prog-sent-at");
      const rowId = id("row-sent-at");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, {
        programId,
        name: "Sent program",
      });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const programs = new ProgramsRepository(storage);
      await programs.publish(programId, TS);
      await service.updateProgramName(practitionerId, programId, "Edited");
      const view = await service.getProgram(practitionerId, programId);
      expect(view.last_sent_at).toBe(TS);
      expect(view.auto_save_status).toEqual({ kind: "unpublished_changes" });
      const list = await service.listPrograms(practitionerId);
      expect(list.items[0]?.last_sent_at).toBe(TS);
    } finally {
      storage.close();
    }
  });

  it("derives share_link_status from share_links without replacing open_share_link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-link-status");
      const service = new ProgramBuilderService(storage);
      const created = await service.createProgram(practitionerId, { programId });
      let view = created.program;
      expect(view.open_share_link).toBe(false);
      expect(view.share_link_status).toBe("none");

      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: id("link-open-1140"),
        programId,
        createdAt: TS,
        expiresAt: null,
      });
      view = await service.getProgram(practitionerId, programId);
      expect(view.open_share_link).toBe(true);
      expect(view.share_link_status).toBe("open");

      await links.closeOpenLinksForProgram(programId, TS);
      view = await service.getProgram(practitionerId, programId);
      expect(view.open_share_link).toBe(false);
      expect(view.share_link_status).toBe("closed");

      await service.deleteProgram(practitionerId, programId);
      view = await service.getProgram(practitionerId, programId);
      expect(view.share_link_status).toBe("closed");
    } finally {
      storage.close();
    }
  });

  it("filters list programs by origin query parameter", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const programs = new ProgramsRepository(storage);
      await routines.createDraft({
        id: id("routine-origin-1140"),
        draftVersionId: id("rv-origin-1140-draft"),
        createdBy: practitionerId,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("rvr-origin-1140"),
        routineId: id("routine-origin-1140"),
        authorId: practitionerId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: 1, days_per_week: 3 },
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("routine-origin-1140"),
        authorId: practitionerId,
        publishedAt: TS,
        name: "Origin filter routine",
      });
      await programs.create({
        id: id("prog-routine-1140"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "From routine",
        routineOrigin: {
          routineId: id("routine-origin-1140"),
          routineVersionId: published.id,
          origin: "used_as_is",
        },
      });
      await programs.create({
        id: id("prog-scratch-only-1140"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "From scratch",
      });
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const all = await handleRequest(
        authedGet(`${BASE}${programsCollectionPath()}`, cookie),
        deps,
      );
      expect(((await all.json()) as { items: unknown[] }).items).toHaveLength(2);

      const fromRoutine = await handleRequest(
        authedGet(`${BASE}${programsCollectionPath()}?origin=from_routine`, cookie),
        deps,
      );
      expect(
        ((await fromRoutine.json()) as { items: { program_id: string }[] }).items,
      ).toEqual([expect.objectContaining({ program_id: id("prog-routine-1140") })]);

      const fromScratch = await handleRequest(
        authedGet(`${BASE}${programsCollectionPath()}?origin=from_scratch`, cookie),
        deps,
      );
      expect(
        ((await fromScratch.json()) as { items: { program_id: string }[] }).items,
      ).toEqual([
        expect.objectContaining({ program_id: id("prog-scratch-only-1140") }),
      ]);
    } finally {
      storage.close();
    }
  });

  it("rejects unknown, empty, and repeated origin query values with identical invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const paths = [
        `${programsCollectionPath()}?origin=`,
        `${programsCollectionPath()}?origin=unknown`,
        `${programsCollectionPath()}?origin=from_routine&origin=from_scratch`,
      ];
      let referenceBody: string | null = null;
      for (const path of paths) {
        const response = await handleRequest(authedGet(`${BASE}${path}`, cookie), deps);
        expect(response.status).toBe(400);
        const body = await response.text();
        expect(JSON.parse(body)).toEqual(INVALID_INPUT_BODY);
        expect(sortedHeaderEntries(response)).toEqual([
          ...CANONICAL_INVALID_INPUT_QUERY_GUARD_HEADERS,
        ]);
        if (referenceBody === null) {
          referenceBody = body;
        } else {
          expect(body).toBe(referenceBody);
        }
      }
    } finally {
      storage.close();
    }
  });

  it("PATCH row exercise_version_id rebuilds snapshot and rejects bad input unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const versionV2 = id("ex-ver-v2-1140");
      await seedSecondApprovedVersion(storage, practitionerId, versionV2, 2);
      const programId = id("prog-row-ver");
      const rowId = id("row-ver-1140");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      const before = await new ProgramRowsRepository(storage).findById(rowId);
      await expect(
        service.updateRow(practitionerId, programId, rowId, {
          exerciseVersionId: versionV2,
        }),
      ).resolves.toBeDefined();
      const after = await new ProgramRowsRepository(storage).findById(rowId);
      expect(after?.exercise_version_id).toBe(versionV2);
      expect(after?.text_snapshot_json).not.toBe(before?.text_snapshot_json);

      await expect(
        service.updateRow(practitionerId, programId, rowId, {
          exerciseVersionId: id("missing-version"),
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const unchanged = await new ProgramRowsRepository(storage).findById(rowId);
      expect(unchanged?.exercise_version_id).toBe(versionV2);
      expect(unchanged?.text_snapshot_json).toBe(after?.text_snapshot_json);
    } finally {
      storage.close();
    }
  });

  it("PATCH exercise_version_id on placeholder rows returns invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-ph-ver");
      const rowId = id("row-ph-ver");
      const requestId = id("req-ph-ver");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      const requests = new ExerciseRequestsRepository(storage);
      await requests.insert({
        id: requestId,
        requestedName: "Pending move",
        requestedBy: practitionerId,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      await service.addPlaceholderRow(practitionerId, programId, {
        rowId,
        exerciseRequestId: requestId,
        prescriptionType: "stretching",
      });
      const before = await new ProgramRowsRepository(storage).findById(rowId);
      await expect(
        service.updateRow(practitionerId, programId, rowId, {
          exerciseVersionId: FIXTURE_VERSION_ID,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const after = await new ProgramRowsRepository(storage).findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("A cannot PATCH B row with exercise_version_id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("1140-patch-b");
      await seedPractitioner(storage, practitionerB, "patchb@example.com");
      await seedApprovedForBuilder(storage, practitionerA);
      const programId = id("prog-patch-a");
      const rowId = id("row-patch-a");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerA, { programId });
      await service.addExerciseRow(practitionerA, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const { deps, cookie } = apiDeps(storage, practitionerB);
      const url = `${BASE}${programRowPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ exercise_version_id: FIXTURE_VERSION_ID }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(PROGRAM_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId query keys on the by-code route", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("1140-query-b");
      await seedPractitioner(storage, practitionerB, "queryb@example.com");
      const created = await new ProgramBuilderService(storage).createProgram(
        practitionerA,
        { programId: id("prog-query-code") },
      );
      const { deps, cookie } = apiDeps(storage, practitionerA);
      for (const suffix of [
        practitionerIdQuerySuffix(practitionerB),
        practitionerUnderscoreIdQuerySuffix(practitionerB),
      ]) {
        const response = await handleRequest(
          authedGet(
            `${BASE}${programByCodePath(created.program.code)}${suffix}`,
            cookie,
          ),
          deps,
        );
        expect(response.status).toBe(400);
        expect(await response.text()).toBe(
          JSON.stringify(INVALID_INPUT_QUERY_GUARD_BODY),
        );
      }
    } finally {
      storage.close();
    }
  });

  it("includes routine_origin on list, deleted list, and program view", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-origin-field");
      const service = new ProgramBuilderService(storage);
      const created = await service.createProgram(practitionerId, { programId });
      expect(created.program.routine_origin).toBeNull();
      const list = await service.listPrograms(practitionerId);
      expect(list.items[0]?.routine_origin).toBeNull();
      await service.deleteProgram(practitionerId, programId);
      const deleted = await service.listRecentlyDeletedPrograms(practitionerId);
      expect(deleted[0]?.routine_origin).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("registers GET by-code in the program builder route table", () => {
    expect(
      programBuilderHttpRouteCases().some(
        (routeCase) =>
          routeCase.method === "GET" &&
          routeCase.path === programByCodePath("PRG-TEST"),
      ),
    ).toBe(true);
  });
});

describe("DIDI-1140 computeShareLinkStatus (unit)", () => {
  it("maps open, closed, and none from open_share_link and link history", () => {
    expect(computeShareLinkStatus({ openShareLink: true, hadAnyLink: true })).toBe(
      "open",
    );
    expect(computeShareLinkStatus({ openShareLink: false, hadAnyLink: true })).toBe(
      "closed",
    );
    expect(computeShareLinkStatus({ openShareLink: false, hadAnyLink: false })).toBe(
      "none",
    );
  });
});
