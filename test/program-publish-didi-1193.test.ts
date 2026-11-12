import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  ProgramPublishService,
  ProgramPublishServiceError,
} from "../src/services/programs/program-publish-service.js";
import {
  PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
  PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE,
  ProgramRepositoryError,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import { programPublishPath } from "../src/programs-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  attachMediaSetToVersion,
  insertExerciseMediaSet,
  openMigratedDatabase,
  seedApprovedExerciseVersionWithoutMedia,
  seedApprovedExerciseVersionWithMedia,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";
const WEB_BASE = MCP_TEST_CONFIG.webAppBaseUrl;

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

async function addProgramRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  rowId: string,
  versionId: string = FIXTURE_VERSION_ID,
  exerciseId: string = FIXTURE_EXERCISE_ID,
) {
  await new ProgramRowsRepository(storage).replaceRow({
    id: rowId,
    programId,
    position: 0,
    exerciseId,
    exerciseVersionId: versionId,
    prescriptionType: "stretching",
    params: { hold_s: 30 },
    textSnapshot: { title: "Heel slide" },
    draftUpdatedAt: TS,
  });
}

describe("program publish missing images DIDI-1193", () => {
  it("rejects first publish when exercise version has no media_set_id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-first");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "No media",
      });
      await seedApprovedExerciseVersionWithoutMedia(storage, practitionerId);
      await addProgramRow(storage, programId, id("row-1193-a"));
      const before = await snapshotPublishContractState(storage, programId);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await expect(
        publish.publishProgram(practitionerId, programId),
      ).rejects.toMatchObject({
        code: "missing_images_block_publish",
        message: PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE,
      } satisfies Partial<ProgramPublishServiceError>);
      expect(await snapshotPublishContractState(storage, programId)).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("rejects first publish when start image key is empty", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-start");
      const mediaSetId = id("media-start-miss");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Start missing",
      });
      await seedApprovedExerciseVersionWithoutMedia(storage, practitionerId);
      await insertExerciseMediaSet(storage, {
        id: mediaSetId,
        startObjectKey: "",
        endObjectKey: "media-sets/end.png",
      });
      await attachMediaSetToVersion(storage, FIXTURE_VERSION_ID, mediaSetId);
      await addProgramRow(storage, programId, id("row-1193-start"));
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await expect(
        publish.publishProgram(practitionerId, programId),
      ).rejects.toMatchObject({
        code: "missing_images_block_publish",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects first publish when media set visibility is draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-draft-vis");
      const mediaSetId = id("media-draft-vis");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Draft visibility",
      });
      await seedApprovedExerciseVersionWithoutMedia(storage, practitionerId);
      await insertExerciseMediaSet(storage, {
        id: mediaSetId,
        startObjectKey: "media-sets/start.png",
        endObjectKey: "media-sets/end.png",
        visibility: "draft",
      });
      await attachMediaSetToVersion(storage, FIXTURE_VERSION_ID, mediaSetId);
      await addProgramRow(storage, programId, id("row-1193-draft-vis"));
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await expect(
        publish.publishProgram(practitionerId, programId),
      ).rejects.toMatchObject({
        code: "missing_images_block_publish",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects first publish when end image key is empty", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-end");
      const mediaSetId = id("media-end-miss");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "End missing",
      });
      await seedApprovedExerciseVersionWithoutMedia(storage, practitionerId);
      await insertExerciseMediaSet(storage, {
        id: mediaSetId,
        startObjectKey: "media-sets/start.png",
        endObjectKey: "",
      });
      await attachMediaSetToVersion(storage, FIXTURE_VERSION_ID, mediaSetId);
      await addProgramRow(storage, programId, id("row-1193-end"));
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await expect(
        publish.publishProgram(practitionerId, programId),
      ).rejects.toMatchObject({
        code: "missing_images_block_publish",
      });
    } finally {
      storage.close();
    }
  });

  it("rejects republish and leaves prior snapshot and link unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-repub");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Republish media",
      });
      await seedApprovedExerciseVersionWithMedia(storage, practitionerId);
      await addProgramRow(storage, programId, id("row-1193-live"));
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      await storage.run(
        `UPDATE exercise_versions SET media_set_id = NULL WHERE id = ?`,
        [FIXTURE_VERSION_ID],
      );
      const before = await snapshotPublishContractState(storage, programId);
      await expect(
        publish.publishProgram(practitionerId, programId, {
          linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
        }),
      ).rejects.toMatchObject({ code: "missing_images_block_publish" });
      expect(await snapshotPublishContractState(storage, programId)).toEqual(before);
    } finally {
      storage.close();
    }
  });

  it("returns missing_images_block_publish over HTTP, not placeholders_block_publish", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-http");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "HTTP block",
      });
      await seedApprovedExerciseVersionWithoutMedia(storage, practitionerId);
      await addProgramRow(storage, programId, id("row-1193-http"));
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const response = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ expires_in: "never" }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe("missing_images_block_publish");
      expect(body.message).toBe(PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE);
      expect(body.error).not.toBe("placeholders_block_publish");
      expect(body.message).not.toBe(PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE);
    } finally {
      storage.close();
    }
  });

  it("repository publish blocks missing media raced into the guarded publish batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-guard-batch");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Guarded batch",
      });
      await seedApprovedExerciseVersionWithMedia(storage, practitionerId);
      await addProgramRow(storage, programId, id("row-1193-guard"));
      const before = await snapshotPublishContractState(storage, programId);
      vi.spyOn(
        programs,
        "programHasExerciseRowsLackingPublishMedia",
      ).mockImplementationOnce(async () => false);
      const baseBatch = storage.batch.bind(storage);
      let stripped = false;
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        if (
          !stripped &&
          statements.some((statement) =>
            statement.sql.includes("published_version = draft_version"),
          )
        ) {
          stripped = true;
          await storage.run(
            `UPDATE exercise_versions SET media_set_id = NULL WHERE id = ?`,
            [FIXTURE_VERSION_ID],
          );
        }
        return baseBatch(statements);
      });
      await expect(programs.publish(programId, TS)).rejects.toThrow(
        PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE,
      );
      await expect(programs.publish(programId, TS)).rejects.toBeInstanceOf(
        ProgramRepositoryError,
      );
      expect(await snapshotPublishContractState(storage, programId)).toEqual(before);
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("repository republish blocks missing media raced into guarded batch and keeps link settings", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-guard-repub");
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Guarded republish",
      });
      await seedApprovedExerciseVersionWithMedia(storage, practitionerId);
      await addProgramRow(storage, programId, id("row-1193-guard-repub"));
      await publish.publishProgram(practitionerId, programId, {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      const before = await snapshotPublishContractState(storage, programId);
      const baseBatch = storage.batch.bind(storage);
      let stripped = false;
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        if (
          !stripped &&
          statements.some((statement) =>
            statement.sql.includes("published_version = draft_version"),
          )
        ) {
          stripped = true;
          await storage.run(
            `UPDATE exercise_versions SET media_set_id = NULL WHERE id = ?`,
            [FIXTURE_VERSION_ID],
          );
        }
        return baseBatch(statements);
      });
      await expect(
        programs.publish(programId, TS, {
          linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week },
          practitionerId,
          expiryNow: new Date(TS),
        }),
      ).rejects.toThrow(PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE);
      expect(await snapshotPublishContractState(storage, programId)).toEqual(before);
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("builder advisory flags orphan media_set_id without a set row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-orphan-set");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Orphan set",
      });
      await seedApprovedExerciseVersionWithoutMedia(storage, practitionerId);
      const orphanSetId = id("media-orphan-row");
      await storage.run(`UPDATE exercise_versions SET media_set_id = ? WHERE id = ?`, [
        orphanSetId,
        FIXTURE_VERSION_ID,
      ]);
      await addProgramRow(storage, programId, id("row-1193-orphan"));
      const view = await new ProgramBuilderService(storage).getProgram(
        practitionerId,
        programId,
      );
      const exerciseRow = view.rows.find((row) => row.kind === "exercise");
      expect(exerciseRow?.lacks_start_or_end_image).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("allows publish when media is complete", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1193-ok");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "With media",
      });
      await seedApprovedExerciseVersionWithMedia(storage, practitionerId);
      await addProgramRow(storage, programId, id("row-1193-ok"));
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await publish.publishProgram(practitionerId, programId);
      expect(
        (await new ProgramsRepository(storage).findById(programId))?.published_at,
      ).toBeTruthy();
    } finally {
      storage.close();
    }
  });
});
