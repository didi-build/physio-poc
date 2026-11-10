import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { formatExerciseParams } from "../src/domain/format-exercise-params.js";
import { PUBLIC_SHARE_LINK_UNAVAILABLE_BODY } from "../src/services/programs/program-publish-service.js";
import { ProgramPublishService } from "../src/services/programs/program-publish-service.js";
import {
  PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import {
  publicShareLinkApiPath,
  programPublishPath,
  programShareLinkPath,
} from "../src/programs-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";

const BASE = "https://physio.test.example";
const WEB_BASE = MCP_TEST_CONFIG.webAppBaseUrl;
const MALFORMED_PATH_SEGMENT = "%E0%A4%A";

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
  email = "coach@example.com",
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email,
      displayName: "Coach",
    },
    sessionCookieName: `physio.fake_session.${practId}`,
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function seedExerciseRow(
  storage: SqlStoragePort,
  programId: string,
  practitionerId: string,
) {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await new ProgramRowsRepository(storage).replaceRow({
    id: id("row-cto"),
    programId,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30 },
    textSnapshot: { title: "Heel slide" },
    draftUpdatedAt: TS,
  });
}

async function seedPlaceholderRow(
  storage: SqlStoragePort,
  practitionerId: string,
  programId: string,
  requestId: string,
) {
  await storage.run(
    `INSERT INTO exercise_requests (
      id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'open', NULL, ?, ?)`,
    [requestId, "Pending row", practitionerId, TS, TS],
  );
  await new ProgramRowsRepository(storage).replaceRow({
    id: id("row-ph-cto"),
    programId,
    position: 1,
    exerciseRequestId: requestId,
    prescriptionType: "stretching",
    params: { hold_s: 20 },
    textSnapshot: { title: "Pending row" },
    draftUpdatedAt: TS,
  });
}

async function snapshotPublishContractState(
  storage: SqlStoragePort,
  programId: string,
) {
  const programs = new ProgramsRepository(storage);
  const links = new ShareLinksRepository(storage);
  const program = await programs.findById(programId);
  const open = await links.findOpenByProgramId(programId);
  return {
    published_version: program?.published_version ?? null,
    published_at: program?.published_at ?? null,
    published_snapshot_json: program?.published_snapshot_json ?? null,
    link_expires_in: program?.link_expires_in ?? null,
    link_expires_on: program?.link_expires_on ?? null,
    open_link: open
      ? {
          id: open.id,
          token: open.token,
          expires_at: open.expires_at,
          closed_at: open.closed_at,
        }
      : null,
  };
}

describe("CTO privileged review — publish/share-link (DIDI-1011 / DIDI-1104)", () => {
  it("leaves link expiry, expiry setting, and snapshot unchanged when publish is rejected for placeholders", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-cto-ph-expiry");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Has placeholders",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      await seedPlaceholderRow(storage, practitionerId, programId, id("req-cto-ph"));
      const before = await snapshotPublishContractState(storage, programId);

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const response = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_week }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("leaves link expiry, expiry setting, and snapshot unchanged when publish is rejected for a missing name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-cto-no-name");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Named once",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      await storage.run(`UPDATE programs SET name = NULL WHERE id = ?`, [programId]);
      const before = await snapshotPublishContractState(storage, programId);

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const response = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_week }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("rejects repository publish when a placeholder is inserted before the snapshot write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-cto-race");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Race",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const before = await snapshotPublishContractState(storage, programId);

      const baseBatch = storage.batch.bind(storage);
      let injected = false;
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        if (
          !injected &&
          statements.some((statement) =>
            statement.sql.includes("published_version = draft_version"),
          )
        ) {
          injected = true;
          await seedPlaceholderRow(storage, practitionerId, programId, id("req-race"));
        }
        return baseBatch(statements);
      });

      await expect(programs.publish(programId, TS)).rejects.toThrow(
        PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
      );

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("leaves link, expiry setting, and snapshot unchanged when HTTP publish races placeholder insert with expires_in", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-cto-http-race");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "HTTP race",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      const before = await snapshotPublishContractState(storage, programId);

      const baseBatch = storage.batch.bind(storage);
      let injected = false;
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        if (
          !injected &&
          statements.some((statement) =>
            statement.sql.includes("published_version = draft_version"),
          )
        ) {
          injected = true;
          await seedPlaceholderRow(
            storage,
            practitionerId,
            programId,
            id("req-http-race"),
          );
        }
        return baseBatch(statements);
      });

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const response = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_week }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("returns the canonical unavailable body for malformed public token encoding", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { deps } = apiDeps(storage, await seedPractitioner(storage));
      const request = new Request(
        `${BASE}/api/public/share-links/${MALFORMED_PATH_SEGMENT}`,
      );
      const response = await handleRequest(request, deps);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_UNAVAILABLE_BODY);
    } finally {
      storage.close();
    }
  });

  it("returns 404 for POST publish when the program id path segment is malformed", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}/api/me/programs/${MALFORMED_PATH_SEGMENT}/publish`;
      const response = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(404);
    } finally {
      storage.close();
    }
  });

  it("returns 404 on cross-owner publish, share-link PATCH, and DELETE without DB changes", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerId = await seedPractitioner(
        storage,
        id("cto-owner"),
        "owner@example.com",
      );
      const otherId = await seedPractitioner(
        storage,
        id("cto-other"),
        "other@example.com",
      );
      const programId = id("prog-cto-cross");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: ownerId,
        createdAt: TS,
        name: "Cross owner",
      });
      await seedExerciseRow(storage, programId, ownerId);
      await publish.publishProgram(ownerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      const before = await snapshotPublishContractState(storage, programId);
      const { deps, cookie } = apiDeps(storage, otherId, "other@example.com");

      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const post = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(post.status).toBe(404);

      const shareUrl = `${BASE}${programShareLinkPath(programId)}`;
      const patch = await handleRequest(
        new Request(
          shareUrl,
          mutatingAppApiRequestInit(shareUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_week }),
          }),
        ),
        deps,
      );
      expect(patch.status).toBe(404);

      const del = await handleRequest(
        new Request(
          shareUrl,
          mutatingAppApiRequestInit(shareUrl, {
            method: "DELETE",
            headers: { cookie },
          }),
        ),
        deps,
      );
      expect(del.status).toBe(404);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("returns the canonical unavailable body for a superseded token after close and republish", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-cto-supersede");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Supersede",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const first = await publish.publishProgram(practitionerId, programId);
      const oldToken = decodeURIComponent(first.share_link.split("/l/")[1]!);
      await publish.closeShareLink(practitionerId, programId);
      await publish.publishProgram(practitionerId, programId);

      const { deps } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath(oldToken)}`),
        deps,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_UNAVAILABLE_BODY);
    } finally {
      storage.close();
    }
  });
});

describe("formatExerciseParams (link page fixture)", () => {
  it("formats the public link row fixture dose line", () => {
    expect(formatExerciseParams({ hold_s: 30 })).toBe("30s hold");
  });
});
