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
  PUBLIC_SHARE_LINK_MEDIA_CACHE_CONTROL,
  PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY,
} from "../src/services/programs/public-share-link-media.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import {
  publicShareLinkApiPath,
  publicShareLinkMediaApiPath,
} from "../src/programs-api-paths.js";
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

const BASE = "https://physio.test.example";
const WEB_BASE = MCP_TEST_CONFIG.webAppBaseUrl;
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

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
  await media.putImage(startKey, PNG_BYTES, "image/png", "public");
  await media.putImage(endKey, PNG_BYTES, "image/png", "public");
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
  };
}

function expectOpenRowShape(row: Record<string, unknown>): void {
  expect(Object.keys(row).sort()).toEqual([...OPEN_ROW_KEYS].sort());
}

async function publishOpenProgram(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  practitionerId: string,
  objects: InMemoryObjectStorage,
) {
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
  return token;
}

describe("DIDI-1191 public share link media (integration)", () => {
  it("returns per-row link-scoped media URLs from the published snapshot without extra fields", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const token = await publishOpenProgram(
        storage,
        id("prog-1191-open"),
        practitionerId,
        objects,
      );
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
        publicShareLinkMediaApiPath(token, FIXTURE_VERSION_ID, "start"),
      );
      expect(JSON.stringify(body)).not.toContain(practitionerId);
      expect(JSON.stringify(body)).not.toContain("exercise_id");
      expect(JSON.stringify(body)).not.toContain("/api/exercise-versions/");
      expect(JSON.stringify(body)).not.toContain("media-sets/");
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

  it("keeps unavailable JSON responses byte-identical and without media", async () => {
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
      const token = await publishOpenProgram(
        storage,
        programId,
        practitionerId,
        objects,
      );
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

  it("performs no writes on public share link JSON GET", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const token = await publishOpenProgram(
        storage,
        id("prog-1191-nowrite-json"),
        practitionerId,
        objects,
      );
      const runSpy = vi.spyOn(storage, "run");
      const deps = apiDeps(storage, objects, practitionerId);
      await handleRequest(new Request(`${BASE}${publicShareLinkApiPath(token)}`), deps);
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });

  it("serves start and end image bytes with required headers for an open link", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const token = await publishOpenProgram(
        storage,
        id("prog-1191-bytes"),
        practitionerId,
        objects,
      );
      const deps = apiDeps(storage, objects, practitionerId);
      for (const phase of ["start", "end"] as const) {
        const response = await handleRequest(
          new Request(
            `${BASE}${publicShareLinkMediaApiPath(token, FIXTURE_VERSION_ID, phase)}`,
          ),
          deps,
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("cache-control")).toBe(
          PUBLIC_SHARE_LINK_MEDIA_CACHE_CONTROL,
        );
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        const bytes = new Uint8Array(await response.arrayBuffer());
        expect(bytes).toEqual(PNG_BYTES);
      }
    } finally {
      storage.close();
    }
  });

  it("returns identical code-only 404 bodies for unknown, closed, and expired link media", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1191-closed");
      const token = await publishOpenProgram(
        storage,
        programId,
        practitionerId,
        objects,
      );
      const mediaPath = publicShareLinkMediaApiPath(token, FIXTURE_VERSION_ID, "start");
      const deps = apiDeps(storage, objects, practitionerId);

      const unknown = await handleRequest(
        new Request(
          `${BASE}${publicShareLinkMediaApiPath("unknown", FIXTURE_VERSION_ID, "start")}`,
        ),
        deps,
      );
      expect(unknown.status).toBe(404);
      const unknownBody = await unknown.text();
      expect(unknownBody).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);

      const open = await handleRequest(new Request(`${BASE}${mediaPath}`), deps);
      expect(open.status).toBe(200);

      const links = new ShareLinksRepository(storage);
      const link = await links.findByToken(token);
      expect(link).not.toBeNull();
      await storage.run("UPDATE share_links SET closed_at = ? WHERE id = ?", [
        TS,
        link!.id,
      ]);

      const closed = await handleRequest(new Request(`${BASE}${mediaPath}`), deps);
      expect(closed.status).toBe(404);
      const closedBody = await closed.text();
      expect(closedBody).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);
      expect(closedBody).toBe(unknownBody);

      const expiredProgramId = id("prog-1191-expired");
      await new ProgramsRepository(storage).create({
        id: expiredProgramId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Expired media",
      });
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-1191-expired"),
        programId: expiredProgramId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, sets: 3, days_per_week: 3 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const publishExpired = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const expiredPublished = await publishExpired.publishProgram(
        practitionerId,
        expiredProgramId,
      );
      const tokenExpired = decodeURIComponent(
        expiredPublished.share_link.split("/l/")[1]!,
      );
      const expiredLink = await links.findByToken(tokenExpired);
      await storage.run("UPDATE share_links SET expires_at = ? WHERE id = ?", [
        "2020-01-01T00:00:00.000Z",
        expiredLink!.id,
      ]);
      const expired = await handleRequest(
        new Request(
          `${BASE}${publicShareLinkMediaApiPath(tokenExpired, FIXTURE_VERSION_ID, "start")}`,
        ),
        deps,
      );
      expect(expired.status).toBe(404);
      expect(await expired.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("returns 404 when the exercise version is not on the published snapshot", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const token = await publishOpenProgram(
        storage,
        id("prog-1191-not-in-snapshot"),
        practitionerId,
        objects,
      );
      const otherVersionId = id("ver-not-on-snapshot");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: otherVersionId,
          exercise_id: FIXTURE_EXERCISE_ID,
          version_number: 9,
          status: "approved",
          approved_by: practitionerId,
          approved_at: TS,
        }),
      ]);
      const deps = apiDeps(storage, objects, practitionerId);
      const response = await handleRequest(
        new Request(
          `${BASE}${publicShareLinkMediaApiPath(token, otherVersionId, "start")}`,
        ),
        deps,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("returns 404 when media is not in the approved public set", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programId = id("prog-1191-private-media");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Private media",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const mediaSetId = id("ms-1191-private");
      await storage.run(
        `INSERT INTO exercise_media_sets (
          id, start_object_key, end_object_key, start_provider_url, visibility, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mediaSetId,
          `media-sets/${mediaSetId}/start.png`,
          `media-sets/${mediaSetId}/end.png`,
          null,
          "draft",
          TS,
        ],
      );
      await storage.run("UPDATE exercise_versions SET media_set_id = ? WHERE id = ?", [
        mediaSetId,
        FIXTURE_VERSION_ID,
      ]);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const result = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(result.share_link.split("/l/")[1]!);
      const json = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath(token)}`),
        apiDeps(storage, objects, practitionerId),
      );
      const jsonBody = (await json.json()) as PublicShareLinkOpenView;
      expect(jsonBody.rows[0]?.media).toBeNull();
      const deps = apiDeps(storage, objects, practitionerId);
      const response = await handleRequest(
        new Request(
          `${BASE}${publicShareLinkMediaApiPath(token, FIXTURE_VERSION_ID, "start")}`,
        ),
        deps,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);
    } finally {
      storage.close();
    }
  });

  it("does not widen media access when a practitioner session is present", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const token = await publishOpenProgram(
        storage,
        id("prog-1191-session"),
        practitionerId,
        objects,
      );
      const deps = apiDeps(storage, objects, practitionerId);
      const cookie = deps.auth.createSessionCookieHeader();
      const response = await handleRequest(
        new Request(
          `${BASE}${publicShareLinkMediaApiPath("unknown", FIXTURE_VERSION_ID, "start")}`,
          { headers: { cookie } },
        ),
        deps,
      );
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY);

      const allowed = await handleRequest(
        new Request(
          `${BASE}${publicShareLinkMediaApiPath(token, FIXTURE_VERSION_ID, "start")}`,
          { headers: { cookie } },
        ),
        deps,
      );
      expect(allowed.status).toBe(200);
    } finally {
      storage.close();
    }
  });

  it("performs no writes on public share link media GET", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage);
      const token = await publishOpenProgram(
        storage,
        id("prog-1191-nowrite-media"),
        practitionerId,
        objects,
      );
      const runSpy = vi.spyOn(storage, "run");
      const deps = apiDeps(storage, objects, practitionerId);
      await handleRequest(
        new Request(
          `${BASE}${publicShareLinkMediaApiPath(token, FIXTURE_VERSION_ID, "end")}`,
        ),
        deps,
      );
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      storage.close();
      vi.restoreAllMocks();
    }
  });
});
