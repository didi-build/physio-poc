import { describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { routineAuthoringItemPath } from "../src/routine-authoring-api-paths.js";
import {
  RoutineVersionRowsRepository,
  RoutinesRepository,
  RoutineVersionsRepository,
} from "../src/storage/repositories/routines.js";
import { PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE } from "../src/domain/exercise-publish-media.js";
import { RoutineAuthoringService } from "../src/services/routines/routine-authoring-service.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
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

const BODY_REGION_KNEE = "br-knee";
const BASE = "https://physio.test.example";

async function seedAuthorDraft(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  routineId: string,
  draftVersionId: string,
  rowId: string,
) {
  await new RoutinesRepository(storage).createDraft({
    id: routineId,
    draftVersionId,
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
  });
  await new RoutineVersionRowsRepository(storage).replaceDraftRow({
    id: rowId,
    routineId,
    authorId: author,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
    draftUpdatedAt: TS,
  });
  await storage.run(`UPDATE routine_versions SET name = ? WHERE id = ?`, [
    "Draft name",
    draftVersionId,
  ]);
}

describe("routine publish missing images DIDI-1193", () => {
  it("rejects draft publish without media and leaves routine unpublished", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routineId = id("rt-1193-draft");
      const draftVersionId = id("rt-1193-draft-ver");
      await seedApprovedExerciseVersionWithoutMedia(storage, author);
      await seedAuthorDraft(storage, author, routineId, draftVersionId, id("rt-row"));
      const service = new RoutineAuthoringService(storage);
      const before = await new RoutinesRepository(storage).findById(routineId);
      await expect(
        service.publishDraft({ practitionerId: author, routineId, name: "Publish me" }),
      ).rejects.toMatchObject({
        code: "missing_images_block_publish",
        message: PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE,
      });
      const after = await new RoutinesRepository(storage).findById(routineId);
      expect(after?.published_version).toBe(before?.published_version);
      expect(after?.published_version).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("maps missing_images_block_publish over HTTP on draft publish", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routineId = id("rt-1193-http");
      const draftVersionId = id("rt-1193-http-ver");
      await seedApprovedExerciseVersionWithoutMedia(storage, author);
      await seedAuthorDraft(
        storage,
        author,
        routineId,
        draftVersionId,
        id("rt-row-http"),
      );
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: author,
          email: "a@example.com",
          displayName: "A",
        },
      });
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      };
      const cookie = auth.createSessionCookieHeader();
      const publishUrl = `${BASE}${routineAuthoringItemPath(routineId)}`;
      const response = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ action: "publish", name: "Knee routine" }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("missing_images_block_publish");
    } finally {
      storage.close();
    }
  });

  it("rejects save_community_version republish without media", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routineId = id("rt-1193-repub");
      const draftVersionId = id("rt-1193-repub-draft");
      await seedApprovedExerciseVersionWithMedia(storage, author);
      await seedAuthorDraft(
        storage,
        author,
        routineId,
        draftVersionId,
        id("rt-row-repub"),
      );
      const service = new RoutineAuthoringService(storage);
      await service.publishDraft({
        practitionerId: author,
        routineId,
        name: "Live v1",
      });
      await storage.run(
        `UPDATE exercise_versions SET media_set_id = NULL WHERE id = ?`,
        [FIXTURE_VERSION_ID],
      );
      const routine = await new RoutinesRepository(storage).findById(routineId);
      await expect(
        service.saveCommunityVersion({
          practitionerId: author,
          routineId,
          expectedPublishedVersion: routine!.published_version!,
          name: "Live v2",
          rows: [
            {
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "missing_images_block_publish" });
      expect(
        (await new RoutinesRepository(storage).findById(routineId))?.published_version,
      ).toBe(1);
      expect(
        await new RoutineVersionsRepository(storage).findPublishedVersion(routineId, 2),
      ).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("repository publishDraft blocks missing media raced into guarded batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routineId = id("rt-1193-guard-draft");
      const draftVersionId = id("rt-1193-guard-draft-ver");
      await seedApprovedExerciseVersionWithMedia(storage, author);
      await seedAuthorDraft(
        storage,
        author,
        routineId,
        draftVersionId,
        id("rt-row-guard"),
      );
      const versions = new RoutineVersionsRepository(storage);
      const before = await new RoutinesRepository(storage).findById(routineId);
      vi.spyOn(versions, "exerciseVersionsLackPublishMedia").mockImplementationOnce(
        async () => false,
      );
      const baseBatch = storage.batch.bind(storage);
      let stripped = false;
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        if (
          !stripped &&
          statements.some((statement) =>
            statement.sql.includes("UPDATE routine_versions SET status = ?"),
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
        versions.publishDraft({
          routineId,
          authorId: author,
          publishedAt: TS,
          name: "Guarded",
        }),
      ).rejects.toMatchObject({
        code: "missing_images_block_publish",
        message: PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE,
      });
      const after = await new RoutinesRepository(storage).findById(routineId);
      expect(after?.published_version).toBe(before?.published_version);
      expect(after?.published_version).toBeNull();
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("repository savePublishedVersion blocks missing media raced into guarded batch", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routineId = id("rt-1193-guard-save");
      const draftVersionId = id("rt-1193-guard-save-draft");
      await seedApprovedExerciseVersionWithMedia(storage, author);
      await seedAuthorDraft(
        storage,
        author,
        routineId,
        draftVersionId,
        id("rt-row-guard-save"),
      );
      const versions = new RoutineVersionsRepository(storage);
      await versions.publishDraft({
        routineId,
        authorId: author,
        publishedAt: TS,
        name: "Live v1",
      });
      const live = await versions.findPublishedVersion(routineId, 1);
      const beforePublished = (
        await new RoutinesRepository(storage).findById(routineId)
      )?.published_version;
      vi.spyOn(versions, "exerciseVersionsLackPublishMedia").mockImplementationOnce(
        async () => false,
      );
      const baseBatch = storage.batch.bind(storage);
      let stripped = false;
      vi.spyOn(storage, "batch").mockImplementation(async (statements) => {
        if (
          !stripped &&
          statements.some(
            (statement) =>
              statement.sql.includes("UPDATE routines SET published_version = ?") &&
              statement.sql.includes("WHERE id = ? AND published_version = ?"),
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
        versions.savePublishedVersion({
          id: id("rt-1193-guard-save-v2"),
          routineId,
          createdBy: author,
          createdAt: TS,
          name: "Live v2",
          copyFromVersionId: live!.id,
          rows: [
            {
              id: id("rt-row-guard-save-v2"),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "missing_images_block_publish" });
      expect(
        (await new RoutinesRepository(storage).findById(routineId))?.published_version,
      ).toBe(beforePublished);
      expect(await versions.findPublishedVersion(routineId, 2)).toBeNull();
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("allows draft publish when media is complete", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routineId = id("rt-1193-ok");
      const draftVersionId = id("rt-1193-ok-ver");
      await seedApprovedExerciseVersionWithMedia(storage, author);
      await seedAuthorDraft(
        storage,
        author,
        routineId,
        draftVersionId,
        id("rt-row-ok"),
      );
      const service = new RoutineAuthoringService(storage);
      await service.publishDraft({ practitionerId: author, routineId, name: "Ready" });
      expect(
        (await new RoutinesRepository(storage).findById(routineId))?.published_version,
      ).toBe(1);
    } finally {
      storage.close();
    }
  });
});
