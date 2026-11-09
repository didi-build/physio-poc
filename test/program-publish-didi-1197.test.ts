import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  ProgramPublishService,
  ProgramPublishServiceError,
} from "../src/services/programs/program-publish-service.js";
import {
  PUBLISH_OPEN_LINK_CLOSED_RACE_SIGNAL,
  ProgramRepositoryError,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import {
  resolveOneYearExpiresAt,
  resolveShareLinkExpiresAt,
} from "../src/domain/share-link-expiry.js";
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
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { programPublishPath } from "../src/programs-api-paths.js";

const WEB_BASE = MCP_TEST_CONFIG.webAppBaseUrl;
const PUBLISH_NOW = "2026-06-15T12:00:00.000Z";
const EXPIRED_AT = "2026-01-01T00:00:00.000Z";
const BASE = "https://physio.test.example";

async function seedExerciseRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  practitionerId: string,
) {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await new ProgramRowsRepository(storage).replaceRow({
    id: id("row-1197"),
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
  const linkRows = await storage.all<{ id: string }>(
    `SELECT id FROM share_links WHERE program_id = ? ORDER BY created_at ASC, id ASC`,
    [programId],
  );
  return {
    published_version: program?.published_version ?? null,
    published_at: program?.published_at ?? null,
    published_snapshot_json: program?.published_snapshot_json ?? null,
    link_expires_in: program?.link_expires_in ?? null,
    link_expires_on: program?.link_expires_on ?? null,
    share_link_count: linkRows.length,
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

async function seedExpiredOpenLink(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
) {
  await storage.run(
    `UPDATE share_links SET expires_at = ? WHERE program_id = ? AND closed_at IS NULL`,
    [EXPIRED_AT, programId],
  );
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
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

describe("program publish DIDI-1197", () => {
  it("revives an expired open link with a picked expiry inside the publish batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-picked");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Revive picked",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const first = await publish.publishProgram(practitionerId, programId);
      await seedExpiredOpenLink(storage, programId);
      const before = await snapshotPublishContractState(storage, programId);

      const result = await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
      });
      const after = await snapshotPublishContractState(storage, programId);

      expect(result.share_link).toBe(first.share_link);
      expect(after.open_link?.id).toBe(before.open_link?.id);
      expect(after.open_link?.token).toBe(before.open_link?.token);
      expect(after.open_link?.closed_at).toBeNull();
      expect(after.open_link?.expires_at).toBe(
        resolveShareLinkExpiresAt(
          { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
          new Date(PUBLISH_NOW),
        ),
      );
      expect(after.link_expires_in).toBe(SHARE_LINK_EXPIRES_IN.one_week);
      expect(after.share_link_count).toBe(1);
      const publicView = await publish.getPublicShareLinkByToken(
        decodeURIComponent(result.share_link.split("/l/")[1]!),
        new Date(PUBLISH_NOW),
      );
      expect(publicView.availability).toBe("open");
    } finally {
      storage.close();
    }
  });

  it("revives an expired open link with the default expiry when none is picked", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-default");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Revive default",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const first = await publish.publishProgram(practitionerId, programId);
      await seedExpiredOpenLink(storage, programId);
      const before = await snapshotPublishContractState(storage, programId);

      const result = await publish.publishProgram(practitionerId, programId);
      const after = await snapshotPublishContractState(storage, programId);

      expect(result.share_link).toBe(first.share_link);
      expect(after.open_link?.token).toBe(before.open_link?.token);
      expect(after.open_link?.expires_at).toBe(
        resolveOneYearExpiresAt(new Date(PUBLISH_NOW)),
      );
      expect(after.link_expires_in).toBe(SHARE_LINK_EXPIRES_IN.one_year);
      expect(after.share_link_count).toBe(1);
      const connector = await publish.getShareConnectorView(practitionerId, programId);
      expect(connector.open_share_link).toBe(true);
      expect(connector.share_link_state).toBe("live");
    } finally {
      storage.close();
    }
  });

  it("creates a new link after close and never reuses the closed token", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-closed");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Closed link",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const first = await publish.publishProgram(practitionerId, programId);
      const oldToken = decodeURIComponent(first.share_link.split("/l/")[1]!);
      await publish.closeShareLink(practitionerId, programId);
      const before = await snapshotPublishContractState(storage, programId);
      expect(before.open_link).toBeNull();

      const second = await publish.publishProgram(practitionerId, programId);
      const after = await snapshotPublishContractState(storage, programId);
      const newToken = decodeURIComponent(second.share_link.split("/l/")[1]!);

      expect(newToken).not.toBe(oldToken);
      expect(after.share_link_count).toBe(2);
      expect(after.open_link?.token).toBe(newToken);
    } finally {
      storage.close();
    }
  });

  it("repository publish ignores open-link revive when practitionerId does not own the program", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerId = await seedPractitioner(
        storage,
        id("1197-repo-owner"),
        "repo-owner@example.com",
      );
      const otherId = await seedPractitioner(
        storage,
        id("1197-repo-other"),
        "repo-other@example.com",
      );
      const programId = id("prog-1197-repo-cross");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: ownerId,
        createdAt: TS,
        name: "Repo cross owner",
      });
      await seedExerciseRow(storage, programId, ownerId);
      await publish.publishProgram(ownerId, programId);
      const open = await new ShareLinksRepository(storage).findOpenByProgramId(
        programId,
      );
      await seedExpiredOpenLink(storage, programId);
      const before = await snapshotPublishContractState(storage, programId);

      await expect(
        programs.publish(programId, PUBLISH_NOW, {
          linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
          openLinkId: open!.id,
          expiryNow: new Date(PUBLISH_NOW),
          practitionerId: otherId,
        }),
      ).rejects.toBeInstanceOf(SqlBatchGuardError);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("does not let a cross-owner practitioner revive or rewrite the link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerId = await seedPractitioner(
        storage,
        id("1197-owner"),
        "owner-1197@example.com",
      );
      const otherId = await seedPractitioner(
        storage,
        id("1197-other"),
        "other-1197@example.com",
      );
      const programId = id("prog-1197-cross");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: ownerId,
        createdAt: TS,
        name: "Cross owner revive",
      });
      await seedExerciseRow(storage, programId, ownerId);
      await publish.publishProgram(ownerId, programId);
      await seedExpiredOpenLink(storage, programId);
      const before = await snapshotPublishContractState(storage, programId);

      await expect(
        publish.publishProgram(otherId, programId, {
          linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
        }),
      ).rejects.toMatchObject({
        code: "program_not_found",
      } satisfies Partial<ProgramPublishServiceError>);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("rolls back the published snapshot when a batched new-link insert fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-atomic-link");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Atomic new link",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const before = await snapshotPublishContractState(storage, programId);

      const baseBatch = storage.batch.bind(storage);
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        const failing = statements.map((statement) => ({ ...statement }));
        const insertIdx = failing.findIndex((statement) =>
          statement.sql.includes("INSERT INTO share_links"),
        );
        if (insertIdx >= 0) {
          failing[insertIdx] = { ...failing[insertIdx]!, minRowsAffected: 999 };
        }
        return baseBatch(failing);
      });

      await expect(
        publish.publishProgram(practitionerId, programId),
      ).rejects.toBeInstanceOf(SqlBatchGuardError);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after.published_snapshot_json).toBe(before.published_snapshot_json);
      expect(after.open_link).toBeNull();
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("repository publish returns publish_open_link_closed_race when the link closes before the batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-repo-race");
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Repo race",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await publish.publishProgram(practitionerId, programId);
      const open = await links.findOpenByProgramId(programId);
      await seedExpiredOpenLink(storage, programId);
      const baseBatch = storage.batch.bind(storage);
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        await storage.run(`UPDATE share_links SET closed_at = ? WHERE id = ?`, [
          PUBLISH_NOW,
          open!.id,
        ]);
        return baseBatch(statements);
      });

      const repoError = await programs
        .publish(programId, PUBLISH_NOW, {
          linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
          openLinkId: open!.id,
          expiryNow: new Date(PUBLISH_NOW),
          practitionerId,
        })
        .then(
          () => {
            throw new Error("expected race signal");
          },
          (error: unknown) => error,
        );
      expect(repoError).toBeInstanceOf(ProgramRepositoryError);
      expect((repoError as ProgramRepositoryError).message).toBe(
        PUBLISH_OPEN_LINK_CLOSED_RACE_SIGNAL,
      );
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("republish after a closing-link race succeeds with a new link over HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-http-race");
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "HTTP race",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const first = await publish.publishProgram(practitionerId, programId);
      const oldToken = decodeURIComponent(first.share_link.split("/l/")[1]!);
      const open = await links.findOpenByProgramId(programId);
      await seedExpiredOpenLink(storage, programId);

      const baseBatch = storage.batch.bind(storage);
      let racedOnce = false;
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        const hasOpenLinkUpdate = statements.some(
          (statement) =>
            statement.sql.includes("UPDATE share_links") &&
            statement.sql.includes("expires_at"),
        );
        if (hasOpenLinkUpdate && !racedOnce) {
          racedOnce = true;
          await storage.run(`UPDATE share_links SET closed_at = ? WHERE id = ?`, [
            PUBLISH_NOW,
            open!.id,
          ]);
        }
        return baseBatch(statements);
      });

      const republished = await publish.publishProgram(practitionerId, programId);
      const newToken = decodeURIComponent(republished.share_link.split("/l/")[1]!);
      expect(newToken).not.toBe(oldToken);
      expect(racedOnce).toBe(true);
      const after = await snapshotPublishContractState(storage, programId);
      expect(after.share_link_count).toBe(2);
      expect(after.open_link?.token).toBe(newToken);
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("over HTTP revives an expired link with the default when the saved custom_date is past and nothing is picked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PUBLISH_NOW));
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-stale-custom");
      const links = new ShareLinksRepository(storage);
      const publishInitial = new ProgramPublishService(
        storage,
        WEB_BASE,
        () => "2026-02-01T12:00:00.000Z",
      );
      const publishRevive = new ProgramPublishService(
        storage,
        WEB_BASE,
        () => PUBLISH_NOW,
      );
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Stale custom revive",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const first = await publishInitial.publishProgram(practitionerId, programId, {
        linkExpiry: {
          expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
          customExpiresOn: "2026-02-15",
        },
      });
      await seedExpiredOpenLink(storage, programId);
      const before = await snapshotPublishContractState(storage, programId);
      expect(before.link_expires_in).toBe(SHARE_LINK_EXPIRES_IN.custom_date);
      expect(before.link_expires_on).toBe("2026-02-15");

      const defaultChoice = await links.resolveDefaultExpiryForProgram(
        practitionerId,
        new Date(PUBLISH_NOW),
      );
      const defaultExpiresAt = resolveShareLinkExpiresAt(
        defaultChoice,
        new Date(PUBLISH_NOW),
      );

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
      expect(response.status).toBe(200);
      const body = (await response.json()) as { share_link: string };
      expect(body.share_link).toBe(first.share_link);

      const after = await snapshotPublishContractState(storage, programId);
      expect(after.open_link?.id).toBe(before.open_link?.id);
      expect(after.open_link?.token).toBe(before.open_link?.token);
      expect(after.open_link?.expires_at).toBe(defaultExpiresAt);
      expect(after.link_expires_in).toBe(defaultChoice.expiresIn);
      expect(after.link_expires_on).toBe(defaultChoice.customExpiresOn ?? null);
      expect(after.share_link_count).toBe(1);

      const connector = await publishRevive.getShareConnectorView(
        practitionerId,
        programId,
      );
      expect(connector.open_share_link).toBe(true);
      expect(connector.share_link_state).toBe("live");
    } finally {
      storage.close();
      vi.useRealTimers();
    }
  });

  it("over HTTP returns invalid_input with no writes when an explicit past custom_date is picked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PUBLISH_NOW));
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-pick-past-custom");
      const publishInitial = new ProgramPublishService(
        storage,
        WEB_BASE,
        () => "2026-02-01T12:00:00.000Z",
      );
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Pick past custom",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await publishInitial.publishProgram(practitionerId, programId, {
        linkExpiry: {
          expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
          customExpiresOn: "2026-02-15",
        },
      });
      await seedExpiredOpenLink(storage, programId);
      const before = await snapshotPublishContractState(storage, programId);

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const response = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              expires_in: SHARE_LINK_EXPIRES_IN.custom_date,
              custom_expires_on: "2026-02-15",
            }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe("invalid_input");
      expect(body.message).toBe("");

      const after = await snapshotPublishContractState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
      vi.useRealTimers();
    }
  });

  it("republishing a live open link without a pick updates only the snapshot in the batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-live-nopick");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Live no pick",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
      });
      const before = await snapshotPublishContractState(storage, programId);
      const liveExpiresAt = before.open_link?.expires_at;

      await storage.run(`UPDATE programs SET name = ? WHERE id = ?`, [
        "Live no pick v2",
        programId,
      ]);
      await publish.publishProgram(practitionerId, programId);
      const after = await snapshotPublishContractState(storage, programId);

      expect(after.open_link?.id).toBe(before.open_link?.id);
      expect(after.open_link?.token).toBe(before.open_link?.token);
      expect(after.open_link?.expires_at).toBe(liveExpiresAt);
      expect(after.link_expires_in).toBe(before.link_expires_in);
      expect(after.link_expires_on).toBe(before.link_expires_on);
      expect(after.open_link?.closed_at).toBeNull();
      expect(after.published_snapshot_json).not.toBe(before.published_snapshot_json);
    } finally {
      storage.close();
    }
  });

  it("maps publish_open_link_closed_race when publish batch retries still fail", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1197-race-code");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => PUBLISH_NOW);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Race code",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await publish.publishProgram(practitionerId, programId);

      const programsRepo = new ProgramsRepository(storage);
      vi.spyOn(programsRepo, "publish").mockImplementation(async () => {
        throw new ProgramRepositoryError(PUBLISH_OPEN_LINK_CLOSED_RACE_SIGNAL);
      });
      Object.assign(publish, { programs: programsRepo });

      const serviceError = await publish.publishProgram(practitionerId, programId).then(
        () => {
          throw new Error("expected publish_open_link_closed_race");
        },
        (error: unknown) => error,
      );
      expect(serviceError).toMatchObject({
        code: "publish_open_link_closed_race",
        message: "",
      } satisfies Partial<ProgramPublishServiceError>);

      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const publishSpy = vi
        .spyOn(ProgramPublishService.prototype, "publishProgram")
        .mockRejectedValue(
          new ProgramPublishServiceError("", "publish_open_link_closed_race"),
        );
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
      publishSpy.mockRestore();
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe("publish_open_link_closed_race");
      expect(body.message).toBe("");
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });
});
