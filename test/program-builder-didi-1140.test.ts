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
import {
  ExerciseRequestsRepository,
  PractitionerExercisesRepository,
} from "../src/storage/repositories/exercise-data.js";
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

const PINNED_NOW = "2026-10-31T12:00:00.000Z";
const PINNED_EXPIRED = "2026-10-31T11:59:59.999Z";

const JSON_HEADERS: ReadonlyArray<[string, string]> = [
  ["content-type", "application/json"],
];

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
  sessionCookieName?: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email: "coach@example.com",
      displayName: "Coach",
    },
    sessionCookieName: sessionCookieName ?? `physio.fake_session.${practId}`,
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
      const service = new ProgramBuilderService(storage);
      const liveForForeign = await service.createProgram(practitionerA, {
        programId: id("prog-1140-live-foreign"),
      });
      const deletedProgramId = id("prog-1140-code");
      const deleted = await service.createProgram(practitionerA, {
        programId: deletedProgramId,
      });
      await service.deleteProgram(practitionerA, deletedProgramId);

      const { deps: depsA, cookie: cookieA } = apiDeps(storage, practitionerA);
      const { deps: depsB, cookie: cookieB } = apiDeps(storage, practitionerB);

      const cases: {
        deps: ReturnType<typeof apiDeps>["deps"];
        cookie: string;
        code: string;
        label: string;
      }[] = [
        {
          deps: depsB,
          cookie: cookieB,
          code: liveForForeign.program.code,
          label: "foreign",
        },
        {
          deps: depsA,
          cookie: cookieA,
          code: "PRG-ZZZZ",
          label: "missing-canonical-a",
        },
        {
          deps: depsB,
          cookie: cookieB,
          code: "PRG-ZZZZ",
          label: "missing-canonical-b",
        },
        {
          deps: depsA,
          cookie: cookieA,
          code: "PRG-NOMATCH",
          label: "missing-invalid-format",
        },
        {
          deps: depsA,
          cookie: cookieA,
          code: deleted.program.code,
          label: "soft-deleted",
        },
        { deps: depsA, cookie: cookieA, code: "AB12", label: "bare-suffix" },
        { deps: depsA, cookie: cookieA, code: "PRGAB12", label: "dashless" },
        {
          deps: depsA,
          cookie: cookieA,
          code: "prgab12",
          label: "lowercase-dashless",
        },
        { deps: depsA, cookie: cookieA, code: "PRG7", label: "lenient-list-only" },
        { deps: depsA, cookie: cookieA, code: "not-a-code", label: "invalid-format" },
      ];

      let reference: {
        status: number;
        headers: [string, string][];
        body: string;
      } | null = null;
      for (const probe of cases) {
        const response = await handleRequest(
          authedGet(`${BASE}${programByCodePath(probe.code)}`, probe.cookie),
          probe.deps,
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

  it("GET by-code matches only trim and uppercase canonical codes", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-exact-code");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-AB12",
        name: "Exact code program",
      });
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const trimmed = await handleRequest(
        authedGet(`${BASE}${programByCodePath(" prg-ab12 ")}`, cookie),
        deps,
      );
      expect(trimmed.status).toBe(200);
      const canonical = await handleRequest(
        authedGet(`${BASE}${programByCodePath("PRG-AB12")}`, cookie),
        deps,
      );
      expect(await trimmed.json()).toEqual(await canonical.json());

      for (const code of ["AB12", "PRGAB12", "prgab12"]) {
        const response = await handleRequest(
          authedGet(`${BASE}${programByCodePath(code)}`, cookie),
          deps,
        );
        expect(response.status).toBe(404);
        expect(JSON.parse(await response.text())).toEqual(PROGRAM_NOT_FOUND_BODY);
      }
    } finally {
      storage.close();
    }
  });

  it("does not match by-code when stored program code is non-canonical (format check after normalize)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-non-canonical-code");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-AB12",
        name: "Will become non-canonical",
      });
      await storage.run(`UPDATE programs SET code = ? WHERE id = ?`, [
        "PRG-AB1",
        programId,
      ]);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        authedGet(`${BASE}${programByCodePath("PRG-AB1")}`, cookie),
        deps,
      );
      expect(response.status).toBe(404);
      expect(JSON.parse(await response.text())).toEqual(PROGRAM_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("by-code does not use lenient list keys (PRG7 does not resolve PRG-PRG7)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await new ProgramsRepository(storage).create({
        id: id("prog-lenient-trap"),
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-PRG7",
        name: "Lenient trap",
      });
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        authedGet(`${BASE}${programByCodePath("PRG-PRG7")}`, cookie),
        deps,
      );
      expect(response.status).toBe(200);
      const wrong = await handleRequest(
        authedGet(`${BASE}${programByCodePath("PRG7")}`, cookie),
        deps,
      );
      expect(wrong.status).toBe(404);
      expect(JSON.parse(await wrong.text())).toEqual(PROGRAM_NOT_FOUND_BODY);
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

  it("derives share_link_status from the latest link with a pinned clock", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-link-status");
      const service = new ProgramBuilderService(storage, () => PINNED_NOW);
      const created = await service.createProgram(practitionerId, { programId });
      let view = created.program;
      expect(view.open_share_link).toBe(false);
      expect(view.share_link_status).toBe("none");

      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: id("link-live-1140"),
        programId,
        createdAt: TS,
        expiresAt: "2026-10-31T12:00:01.000Z",
      });
      view = await service.getProgram(practitionerId, programId);
      expect(view.open_share_link).toBe(true);
      expect(view.share_link_status).toBe("open");

      const programNeverExpires = id("prog-never-expires-status");
      await service.createProgram(practitionerId, { programId: programNeverExpires });
      await links.createOpenLink({
        id: id("link-never-expires-status"),
        programId: programNeverExpires,
        createdAt: TS,
        expiresAt: null,
      });
      view = await service.getProgram(practitionerId, programNeverExpires);
      expect(view.open_share_link).toBe(true);
      expect(view.share_link_status).toBe("open");

      await links.closeOpenLinksForProgram(programId, TS);
      view = await service.getProgram(practitionerId, programId);
      expect(view.open_share_link).toBe(false);
      expect(view.share_link_status).toBe("closed");

      const programExpired = id("prog-expired-status");
      await service.createProgram(practitionerId, { programId: programExpired });
      await links.createOpenLink({
        id: id("link-expired-status"),
        programId: programExpired,
        createdAt: TS,
        expiresAt: PINNED_EXPIRED,
      });
      view = await service.getProgram(practitionerId, programExpired);
      expect(view.open_share_link).toBe(true);
      expect(view.share_link_status).toBe("closed");

      const programExact = id("prog-expiry-exact");
      await service.createProgram(practitionerId, { programId: programExact });
      await links.createOpenLink({
        id: id("link-expiry-exact"),
        programId: programExact,
        createdAt: TS,
        expiresAt: PINNED_NOW,
      });
      view = await service.getProgram(practitionerId, programExact);
      expect(view.share_link_status).toBe("closed");
    } finally {
      storage.close();
    }
  });

  it("share_link_status uses the latest link when older and newer links disagree", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage, () => PINNED_NOW);
      const programRevokedThenOpen = id("prog-link-latest-open");
      await service.createProgram(practitionerId, {
        programId: programRevokedThenOpen,
      });
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id("link-old-closed"),
          programRevokedThenOpen,
          "tok-old-closed",
          "2026-10-31T12:00:01.000Z",
          TS,
          "2026-10-31T11:00:00.000Z",
        ],
      );
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [
          id("link-new-open"),
          programRevokedThenOpen,
          "tok-new-open",
          "2026-10-31T12:00:01.000Z",
          "2026-10-31T12:00:00.000Z",
        ],
      );
      let view = await service.getProgram(practitionerId, programRevokedThenOpen);
      expect(view.share_link_status).toBe("open");
      expect(view.open_share_link).toBe(true);

      const programOpenThenRevoked = id("prog-link-latest-closed");
      await service.createProgram(practitionerId, {
        programId: programOpenThenRevoked,
      });
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [
          id("link-old-open"),
          programOpenThenRevoked,
          "tok-old-open",
          "2026-10-31T12:00:01.000Z",
          "2026-10-31T11:00:00.000Z",
        ],
      );
      await storage.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id("link-new-closed"),
          programOpenThenRevoked,
          "tok-new-closed",
          "2026-10-31T12:00:01.000Z",
          TS,
          "2026-10-31T12:00:00.000Z",
        ],
      );
      view = await service.getProgram(practitionerId, programOpenThenRevoked);
      expect(view.share_link_status).toBe("closed");
      expect(view.open_share_link).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("does not let another program's link history change share_link_status", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("1140-link-b");
      await seedPractitioner(storage, practitionerB, "linkb@example.com");
      const service = new ProgramBuilderService(storage, () => PINNED_NOW);
      const programA1 = await service.createProgram(practitionerA, {
        programId: id("prog-a1-link"),
      });
      await service.createProgram(practitionerA, { programId: id("prog-a2-link") });
      const programB = await service.createProgram(practitionerB, {
        programId: id("prog-b-link"),
      });
      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: id("link-b-closed"),
        programId: programB.program.program_id,
        createdAt: TS,
        expiresAt: PINNED_EXPIRED,
      });
      await links.closeOpenLinksForProgram(programB.program.program_id, TS);

      const viewA1 = await service.getProgram(
        practitionerA,
        programA1.program.program_id,
      );
      expect(viewA1.share_link_status).toBe("none");
      const listA = await service.listPrograms(practitionerA);
      expect(listA.items.every((item) => item.share_link_status === "none")).toBe(true);
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

  it("share_link_status on soft-deleted programs reflects link history", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const service = new ProgramBuilderService(storage, () => PINNED_NOW);
      const neverLinkedId = id("prog-deleted-never-linked");
      await service.createProgram(practitionerId, { programId: neverLinkedId });
      await service.deleteProgram(practitionerId, neverLinkedId);
      let view = await service.getProgram(practitionerId, neverLinkedId);
      expect(view.share_link_status).toBe("none");
      expect(view.open_share_link).toBe(false);

      const hadLinkId = id("prog-deleted-had-link");
      await service.createProgram(practitionerId, { programId: hadLinkId });
      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: id("link-deleted-program"),
        programId: hadLinkId,
        createdAt: TS,
        expiresAt: null,
      });
      await service.deleteProgram(practitionerId, hadLinkId);
      view = await service.getProgram(practitionerId, hadLinkId);
      expect(view.share_link_status).toBe("closed");
      expect(view.open_share_link).toBe(false);
    } finally {
      storage.close();
    }
  });

  it("findByExactCode uses idx_programs_code in the query plan", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await new ProgramsRepository(storage).create({
        id: id("prog-explain-code"),
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-EXPL",
        name: "Explain index",
      });
      const plan = storage
        .nativeDatabase()
        .prepare(
          "EXPLAIN QUERY PLAN SELECT id FROM programs WHERE code = ? COLLATE NOCASE LIMIT 1",
        )
        .all("PRG-EXPL");
      expect(JSON.stringify(plan)).toContain("idx_programs_code");
    } finally {
      storage.close();
    }
  });

  it("GET by-code uses exact lookup not lenient findByCode keys", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const canonicalId = id("prog-canonical-trap");
      const trapId = id("prog-lenient-trap");
      await programs.create({
        id: canonicalId,
        createdBy: practitionerId,
        createdAt: TS,
        code: "PRG-AB12",
        name: "Canonical trap target",
      });
      await storage.run(
        `INSERT INTO programs (
          id, created_by, created_at, draft_updated_at, code, name,
          source_routine_id, source_routine_version_id, source_routine_origin,
          published_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
        [trapId, practitionerId, TS, TS, "PRG-PRG-AB12", "Lenient trap decoy"],
      );
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        authedGet(`${BASE}${programByCodePath("PRG-AB12")}`, cookie),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { program_id: string };
      expect(body.program_id).toBe(canonicalId);
    } finally {
      storage.close();
    }
  });

  it("rejects PATCH exercise_version_id for another exercise with invalid_input unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const otherExerciseId = id("ex-other-1140");
      const otherVersionId = id("ex-ver-other-1140");
      await storage.run(
        "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
        [otherExerciseId, "stretch", practitionerId, TS],
      );
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: otherVersionId,
          exercise_id: otherExerciseId,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
          title: "Other exercise",
        }),
      );
      const programId = id("prog-wrong-ex-ver");
      const rowId = id("row-wrong-ex-ver");
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
          exerciseVersionId: otherVersionId,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const after = await new ProgramRowsRepository(storage).findById(rowId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("rejects PATCH to a draft exercise version with invalid_input and no row write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const draftVersionId = id("ex-ver-draft-patch-1140");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: draftVersionId,
          version_number: 2,
          status: "draft",
          title: "Draft heel raise",
        }),
      );
      const routines = new RoutinesRepository(storage);
      const routineRows = new RoutineVersionRowsRepository(storage);
      const routineVersions = new RoutineVersionsRepository(storage);
      const routineId = id("routine-draft-patch-1140");
      await routines.createDraft({
        id: routineId,
        draftVersionId: id("rv-draft-patch-1140"),
        createdBy: practitionerId,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await routineRows.replaceDraftRow({
        id: id("rvr-draft-patch-1140"),
        routineId,
        authorId: practitionerId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: 1, days_per_week: 3 },
        draftUpdatedAt: TS,
      });
      await routineVersions.publishDraft({
        routineId,
        authorId: practitionerId,
        publishedAt: TS,
        name: "Draft patch routine",
      });
      const programId = id("prog-draft-ver-patch");
      const rowId = id("row-draft-ver-patch");
      const service = new ProgramBuilderService(storage);
      await service.createProgramFromRoutine(practitionerId, {
        programId,
        routineId,
        source: "community",
        rowIds: [rowId],
      });
      expect(
        (await service.getProgram(practitionerId, programId)).routine_origin?.used_as,
      ).toBe("used_as_is");
      const programBefore = await new ProgramsRepository(storage).findById(programId);
      const rowBefore = await new ProgramRowsRepository(storage).findById(rowId);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const url = `${BASE}${programRowPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ exercise_version_id: draftVersionId }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(INVALID_INPUT_BODY);
      expect(await new ProgramRowsRepository(storage).findById(rowId)).toEqual(
        rowBefore,
      );
      const programAfter = await new ProgramsRepository(storage).findById(programId);
      expect(programAfter).toEqual(programBefore);
      expect(
        (await service.getProgram(practitionerId, programId)).routine_origin?.used_as,
      ).toBe("used_as_is");
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

  it("PATCH exercise_version_id on placeholder rows returns canonical invalid_input unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
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
      const programBefore = await new ProgramsRepository(storage).findById(programId);
      const before = await new ProgramRowsRepository(storage).findById(rowId);
      const { deps, cookie } = apiDeps(storage, practitionerId);
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
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(INVALID_INPUT_BODY);
      const after = await new ProgramRowsRepository(storage).findById(rowId);
      expect(after).toEqual(before);
      const programAfter = await new ProgramsRepository(storage).findById(programId);
      expect(programAfter?.draft_updated_at).toBe(programBefore?.draft_updated_at);
      expect(programAfter?.source_routine_origin).toBe(
        programBefore?.source_routine_origin,
      );
    } finally {
      storage.close();
    }
  });

  it("rejects non-string exercise_version_id on PATCH with invalid_input and no draft edit", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const programId = id("prog-bad-ver-type");
      const rowId = id("row-bad-ver-type");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      const programBefore = await new ProgramsRepository(storage).findById(programId);
      const rowBefore = await new ProgramRowsRepository(storage).findById(rowId);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const url = `${BASE}${programRowPath(programId, rowId)}`;
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ exercise_version_id: 7 }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(INVALID_INPUT_BODY);
      const programAfter = await new ProgramsRepository(storage).findById(programId);
      expect(programAfter?.draft_updated_at).toBe(programBefore?.draft_updated_at);
      expect(await new ProgramRowsRepository(storage).findById(rowId)).toEqual(
        rowBefore,
      );
    } finally {
      storage.close();
    }
  });

  it("PATCH exercise_version_id re-validates prescription type against the new version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const versionV2 = id("ex-ver-v2-prescription");
      await seedSecondApprovedVersion(storage, practitionerId, versionV2, 2);
      const programId = id("prog-prescription-revalidate");
      const rowId = id("row-prescription-revalidate");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      await storage.run(`UPDATE program_rows SET prescription_type = ? WHERE id = ?`, [
        "isometric",
        rowId,
      ]);
      const before = await new ProgramRowsRepository(storage).findById(rowId);
      await expect(
        service.updateRow(practitionerId, programId, rowId, {
          exerciseVersionId: versionV2,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(await new ProgramRowsRepository(storage).findById(rowId)).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("PATCH exercise_version_id marks routine_origin tweaked when used_as_is", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [practitionerId, TS, FIXTURE_VERSION_ID],
      );
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const routineId = id("routine-tweak-ver");
      const draftVersionId = id("rv-tweak-ver-draft");
      await routines.createDraft({
        id: routineId,
        draftVersionId,
        createdBy: practitionerId,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("rvr-tweak-ver"),
        routineId,
        authorId: practitionerId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: {
          hold_s: 30,
          per_day: { min: 1, max: 2 },
          days_per_week: 7,
        },
        draftUpdatedAt: TS,
      });
      await versions.publishDraft({
        routineId,
        authorId: practitionerId,
        publishedAt: TS,
        name: "Tweak ver routine",
      });
      const versionV2 = id("ex-ver-v2-tweak");
      await seedSecondApprovedVersion(storage, practitionerId, versionV2, 2);
      const programId = id("prog-routine-tweak-ver");
      const rowId = id("row-routine-tweak-ver");
      const service = new ProgramBuilderService(storage);
      await service.createProgramFromRoutine(practitionerId, {
        programId,
        routineId,
        source: "community",
        rowIds: [rowId],
      });
      expect(
        (await service.getProgram(practitionerId, programId)).routine_origin?.used_as,
      ).toBe("used_as_is");
      const viewRow = (await service.getProgram(practitionerId, programId)).rows[0]!;
      await service.updateRow(practitionerId, programId, viewRow.id, {
        exerciseVersionId: versionV2,
      });
      expect(
        (await service.getProgram(practitionerId, programId)).routine_origin?.used_as,
      ).toBe("tweaked");
    } finally {
      storage.close();
    }
  });

  it("PATCH exercise_version_id rebuilds snapshot with practitioner text overrides", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const versionV2 = id("ex-ver-v2-override");
      await seedSecondApprovedVersion(storage, practitionerId, versionV2, 2);
      const pe = new PractitionerExercisesRepository(storage);
      await pe.upsert({
        practitionerId,
        exerciseId: FIXTURE_EXERCISE_ID,
        savedAt: TS,
        textOverrides: {
          title: { value: "My row title", base: "Lib title" },
        },
      });
      const programId = id("prog-override-ver");
      const rowId = id("row-override-ver");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      await service.updateRow(practitionerId, programId, rowId, {
        exerciseVersionId: versionV2,
      });
      const view = await service.getProgram(practitionerId, programId);
      expect(view.rows[0]?.text_snapshot.title).toBe("My row title");
    } finally {
      storage.close();
    }
  });

  it("PATCH exercise_version_id keeps existing note and params when omitted", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const versionV2 = id("ex-ver-v2-keep-fields");
      await seedSecondApprovedVersion(storage, practitionerId, versionV2, 2);
      const programId = id("prog-keep-fields");
      const rowId = id("row-keep-fields");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      await service.updateRow(practitionerId, programId, rowId, {
        note: "Keep this note",
        params: { hold_s: 30, per_day: 2, days_per_week: 4 },
      });
      const paramsBefore = (await new ProgramRowsRepository(storage).findById(rowId))
        ?.params_json;
      const noteBefore = (await new ProgramRowsRepository(storage).findById(rowId))
        ?.note;
      await service.updateRow(practitionerId, programId, rowId, {
        exerciseVersionId: versionV2,
      });
      const rowAfter = await new ProgramRowsRepository(storage).findById(rowId);
      expect(rowAfter?.params_json).toBe(paramsBefore);
      expect(rowAfter?.note).toBe(noteBefore);
    } finally {
      storage.close();
    }
  });

  it("PATCH exercise_version_id keeps every row when the program has multiple rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedForBuilder(storage, practitionerId);
      const versionV2 = id("ex-ver-v2-multi");
      await seedSecondApprovedVersion(storage, practitionerId, versionV2, 2);
      const programId = id("prog-multi-row-ver");
      const row0 = id("row-multi-0");
      const row1 = id("row-multi-1");
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId });
      await service.addExerciseRow(practitionerId, programId, {
        rowId: row0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      await service.addExerciseRow(practitionerId, programId, {
        rowId: row1,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
      });
      const rowsBefore = await new ProgramRowsRepository(storage).listForProgram(
        programId,
      );
      await service.updateRow(practitionerId, programId, row1, {
        exerciseVersionId: versionV2,
      });
      const rowsAfter = await new ProgramRowsRepository(storage).listForProgram(
        programId,
      );
      expect(rowsAfter.map((row) => row.id).sort()).toEqual(
        rowsBefore.map((row) => row.id).sort(),
      );
      const untouched = rowsAfter.find((row) => row.id === row0);
      const before0 = rowsBefore.find((row) => row.id === row0);
      expect(untouched?.exercise_version_id).toBe(before0?.exercise_version_id);
      expect(untouched?.text_snapshot_json).toBe(before0?.text_snapshot_json);
      expect(untouched?.position).toBe(before0?.position);
    } finally {
      storage.close();
    }
  });

  it("A last_sent_at and share_link_status ignore B program state", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("1140-field-b");
      await seedPractitioner(storage, practitionerB, "fieldb@example.com");
      await seedApprovedForBuilder(storage, practitionerB);
      const service = new ProgramBuilderService(storage, () => PINNED_NOW);
      const programA = await service.createProgram(practitionerA, {
        programId: id("prog-field-a"),
      });
      const programB = id("prog-field-b");
      await service.createProgram(practitionerB, {
        programId: programB,
        name: "Program B",
      });
      await service.addExerciseRow(practitionerB, programB, {
        rowId: id("row-field-b"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await new ProgramsRepository(storage).publish(programB, TS);
      const links = new ShareLinksRepository(storage);
      await links.createOpenLink({
        id: id("link-field-b"),
        programId: programB,
        createdAt: TS,
        expiresAt: PINNED_EXPIRED,
      });
      await links.closeOpenLinksForProgram(programB, TS);

      const viewA = await service.getProgram(
        practitionerA,
        programA.program.program_id,
      );
      expect(viewA.last_sent_at).toBeNull();
      expect(viewA.share_link_status).toBe("none");
      const listA = await service.listPrograms(practitionerA);
      expect(listA.items[0]?.last_sent_at).toBeNull();
      expect(listA.items[0]?.share_link_status).toBe("none");
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
      const programBefore = await new ProgramsRepository(storage).findById(programId);
      const rowBefore = await new ProgramRowsRepository(storage).findById(rowId);
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
      expect(await new ProgramRowsRepository(storage).findById(rowId)).toEqual(
        rowBefore,
      );
      const programAfter = await new ProgramsRepository(storage).findById(programId);
      expect(programAfter?.draft_updated_at).toBe(programBefore?.draft_updated_at);
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
          routeCase.path === programByCodePath("PRG-ROUTE"),
      ),
    ).toBe(true);
  });
});

describe("DIDI-1140 computeShareLinkStatus (unit)", () => {
  const link = (
    partial: Partial<{
      expires_at: string | null;
      closed_at: string | null;
    }> = {},
  ) => ({
    id: "link-1",
    program_id: "prog-1",
    token: "tok",
    created_at: TS,
    expires_at: null as string | null,
    closed_at: null as string | null,
    ...partial,
  });

  it("maps latest link state with request time", () => {
    expect(
      computeShareLinkStatus({ latestLink: null, requestTimeIso: PINNED_NOW }),
    ).toBe("none");
    expect(
      computeShareLinkStatus({
        latestLink: link({ expires_at: "2026-10-31T12:00:01.000Z" }),
        requestTimeIso: PINNED_NOW,
      }),
    ).toBe("open");
    expect(
      computeShareLinkStatus({
        latestLink: link({ expires_at: null }),
        requestTimeIso: PINNED_NOW,
      }),
    ).toBe("open");
    expect(
      computeShareLinkStatus({
        latestLink: link({ expires_at: PINNED_EXPIRED }),
        requestTimeIso: PINNED_NOW,
      }),
    ).toBe("closed");
    expect(
      computeShareLinkStatus({
        latestLink: link({ expires_at: PINNED_NOW }),
        requestTimeIso: PINNED_NOW,
      }),
    ).toBe("closed");
    expect(
      computeShareLinkStatus({
        latestLink: link({ closed_at: TS }),
        requestTimeIso: PINNED_NOW,
      }),
    ).toBe("closed");
  });
});
