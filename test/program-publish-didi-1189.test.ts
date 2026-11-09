import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  ProgramPublishService,
  ProgramPublishServiceError,
} from "../src/services/programs/program-publish-service.js";
import {
  PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
  PUBLISH_STALE_DRAFT_SIGNAL,
  ProgramRepositoryError,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import { SqlBatchGuardError } from "../src/storage/errors/sql-batch-error.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { programPublishPath } from "../src/programs-api-paths.js";

const BASE = "https://physio.test.example";
const WEB_BASE = MCP_TEST_CONFIG.webAppBaseUrl;

async function seedExerciseRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  practitionerId: string,
) {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await new ProgramRowsRepository(storage).replaceRow({
    id: id("row-1189"),
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

async function snapshotPublishContractState(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
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
    sessionCookieName: `physio.fake_session.${practId}`,
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

describe("program publish DIDI-1189", () => {
  it("rolls back snapshot, link, and expiry settings when the open-link expiry write fails in the publish batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1189-atomic");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Atomic expiry",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      const before = await snapshotPublishContractState(storage, programId);

      const baseBatch = storage.batch.bind(storage);
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        const failing = statements.map((statement) => ({ ...statement }));
        const linkIdx = failing.findIndex(
          (statement) =>
            statement.sql.includes("share_links") &&
            statement.sql.includes("expires_at"),
        );
        if (linkIdx >= 0) {
          failing[linkIdx] = { ...failing[linkIdx]!, minRowsAffected: 999 };
        }
        return baseBatch(failing);
      });

      await expect(
        publish.publishProgram(practitionerId, programId, {
          linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
        }),
      ).rejects.toBeInstanceOf(SqlBatchGuardError);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("returns stale_draft_retry when draft_version changes before the guarded publish write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1189-stale");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Stale draft",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const baseBatch = storage.batch.bind(storage);
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        await storage.run(`UPDATE programs SET draft_version = 2 WHERE id = ?`, [
          programId,
        ]);
        return baseBatch(statements);
      });
      const staleError = await publish.publishProgram(practitionerId, programId).then(
        () => {
          throw new Error("expected stale_draft_retry");
        },
        (error: unknown) => error,
      );
      expect(staleError).toMatchObject({
        code: "stale_draft_retry",
        message: "",
      } satisfies Partial<ProgramPublishServiceError>);
      expect(staleError).not.toMatchObject({
        code: "placeholders_block_publish",
      });
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("repository publish signals stale_draft_retry when draft_version races the batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1189-repo-stale");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Repo stale",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const baseBatch = storage.batch.bind(storage);
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        await storage.run(`UPDATE programs SET draft_version = 2 WHERE id = ?`, [
          programId,
        ]);
        return baseBatch(statements);
      });
      const repoError = await programs.publish(programId, TS).then(
        () => {
          throw new Error("expected repository stale signal");
        },
        (error: unknown) => error,
      );
      expect(repoError).toBeInstanceOf(ProgramRepositoryError);
      expect((repoError as ProgramRepositoryError).message).toBe(
        PUBLISH_STALE_DRAFT_SIGNAL,
      );
      expect((repoError as ProgramRepositoryError).message).not.toBe(
        PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
      );
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("maps stale_draft_retry over HTTP without placeholders_block_publish", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1189-http-stale");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "HTTP stale",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const baseBatch = storage.batch.bind(storage);
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        await storage.run(`UPDATE programs SET draft_version = 2 WHERE id = ?`, [
          programId,
        ]);
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
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe("stale_draft_retry");
      expect(body.message).toBe("");
      expect(body.error).not.toBe("placeholders_block_publish");
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("keeps publish batch statements guarded by draft_version", () => {
    const programs = new ProgramsRepository({
      batch: async () => {},
      run: async () => ({ rowsAffected: 0 }),
      all: async () => [],
      first: async () => null,
    });
    const statement = programs.buildPublishSnapshotUpdateStatement({
      programId: id("prog-guard-sql"),
      draftVersion: 1,
      publishName: "Guarded",
      publishedAt: TS,
      snapshotJson: "{}",
    });
    expect(statement.sql).toContain("draft_version = ?");
    expect(statement.minRowsAffected).toBe(1);
  });
});
