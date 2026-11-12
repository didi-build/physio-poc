import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import {
  ProgramPublishService,
  PUBLIC_SHARE_LINK_UNAVAILABLE_BODY,
  PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW,
  type PublicShareLinkOpenView,
} from "../src/services/programs/program-publish-service.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { publicShareLinkApiPath } from "../src/programs-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { exerciseMediaExtraRouteHandlers } from "./helpers/exercise-media-http.js";
import { exerciseMediaPublicImagePath } from "../src/exercise-media-api-paths.js";

const BASE = "https://physio.test.example";
const WEB_BASE = MCP_TEST_CONFIG.webAppBaseUrl;

const OPEN_ROW_KEYS = [
  "position",
  "title",
  "prescription_type",
  "params",
  "note",
  "media",
] as const;

const OPEN_VIEW_KEYS = [
  "availability",
  "program_name",
  "published_at",
  "expiry_line",
  "rows",
] as const;

async function seedPublicMediaForFixtureVersion(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  objects: InMemoryObjectStorage,
) {
  const mediaSetId = id("ms-1191");
  const startKey = `media-sets/${mediaSetId}/start.png`;
  const endKey = `media-sets/${mediaSetId}/end.png`;
  await storage.run(
    `INSERT INTO exercise_media_sets (
      id, start_object_key, end_object_key, start_provider_url, visibility, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [mediaSetId, startKey, endKey, null, "public", TS],
  );
  await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
    mediaSetId,
    FIXTURE_VERSION_ID,
  ]);
  const media = new PrefixMediaStorage(objects);
  const png = new Uint8Array([137, 80, 78, 71]);
  await media.putImage(startKey, png, "image/png", "public");
  await media.putImage(endKey, png, "image/png", "public");
}

async function seedExerciseRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  practitionerId: string,
) {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await new ProgramRowsRepository(storage).replaceRow({
    id: id("row-1191"),
    programId,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30, sets: 3, days_per_week: 3 },
    textSnapshot: { title: "Heel slide" },
    draftUpdatedAt: TS,
  });
}

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  objects: InMemoryObjectStorage,
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
    sql: storage,
    objects,
    config: MCP_TEST_CONFIG,
    mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    auth,
    extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
  };
}

function expectOpenRowShape(row: Record<string, unknown>): void {
  expect(Object.keys(row).sort()).toEqual([...OPEN_ROW_KEYS].sort());
}

describe("DIDI-1191 public share link media (integration)", () => {
  it("returns per-row media URLs from the published snapshot version without extra fields", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1191-open");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Media program",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await seedPublicMediaForFixtureVersion(storage, objects);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const result = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(result.share_link.split("/l/")[1]!);
      const deps = apiDeps(storage, objects, practitionerId);
      const response = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath(token)}`),
        deps,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as PublicShareLinkOpenView;
      expect(body.availability).toBe("open");
      expect(Object.keys(body).sort()).toEqual([...OPEN_VIEW_KEYS].sort());
      expect(body.rows).toHaveLength(1);
      expectOpenRowShape(body.rows[0] as Record<string, unknown>);
      const media = body.rows[0]!.media;
      expect(media).not.toBeNull();
      expect(Object.keys(media!).sort()).toEqual(["end_url", "start_url"]);
      expect(media!.start_url).toContain(
        exerciseMediaPublicImagePath(FIXTURE_VERSION_ID, "start"),
      );
      expect(JSON.stringify(body)).not.toContain(practitionerId);
      expect(JSON.stringify(body)).not.toContain("exercise_id");
    } finally {
      storage.close();
    }
  });

  it("returns media null for a row whose pinned version lacks public media", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1191-missing");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Missing media",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const result = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(result.share_link.split("/l/")[1]!);
      const deps = apiDeps(storage, objects, practitionerId);
      const response = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath(token)}`),
        deps,
      );
      const body = (await response.json()) as PublicShareLinkOpenView;
      expect(body.rows[0]?.media).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("keeps unavailable responses byte-identical and without media", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const deps = apiDeps(storage, objects, await seedPractitioner(storage));
      const response = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath("unknown-token-1191")}`),
        deps,
      );
      const text = await response.text();
      expect(text).toBe(PUBLIC_SHARE_LINK_UNAVAILABLE_BODY);
      expect(text).not.toContain("media");
      expect(JSON.parse(text)).toEqual(PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW);
    } finally {
      storage.close();
    }
  });

  it("keeps media URLs on the pinned snapshot version when a newer approved version exists", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1191-pin");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Pinned media",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await seedPublicMediaForFixtureVersion(storage, objects);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const published = await publish.publishProgram(practitionerId, programId);
      const newerVersionId = id("ver-1191-newer");
      const newerMediaSetId = id("ms-1191-newer");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: newerVersionId,
          exercise_id: FIXTURE_EXERCISE_ID,
          version_number: 2,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
        }),
      ]);
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          newerMediaSetId,
          `media-sets/${newerMediaSetId}/start.png`,
          `media-sets/${newerMediaSetId}/end.png`,
          null,
          "public",
          TS,
        ],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        newerMediaSetId,
        newerVersionId,
      ]);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const deps = apiDeps(storage, objects, practitionerId);
      const response = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath(token)}`),
        deps,
      );
      const body = (await response.json()) as PublicShareLinkOpenView;
      expect(body.rows[0]?.media?.start_url).toContain(FIXTURE_VERSION_ID);
      expect(body.rows[0]?.media?.start_url).not.toContain(newerVersionId);
    } finally {
      storage.close();
    }
  });

  it("performs no writes on public share link GET", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1191-nowrite");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "No write",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      await seedPublicMediaForFixtureVersion(storage, objects);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const result = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(result.share_link.split("/l/")[1]!);
      const runSpy = vi.spyOn(storage, "run");
      const deps = apiDeps(storage, objects, practitionerId);
      await handleRequest(new Request(`${BASE}${publicShareLinkApiPath(token)}`), deps);
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });
});
