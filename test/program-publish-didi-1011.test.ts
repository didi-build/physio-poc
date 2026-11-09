import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  ProgramPublishService,
  ProgramPublishServiceError,
  PUBLIC_SHARE_LINK_UNAVAILABLE_BODY,
  PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW,
} from "../src/services/programs/program-publish-service.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import {
  GLOBAL_SHARE_LINK_DEFAULT_EXPIRES_IN,
  resolveOneYearExpiresAt,
  resolveShareLinkExpiresAt,
} from "../src/domain/share-link-expiry.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import { PROGRAM_PUBLISH_NAME_REQUIRED } from "../src/copy/programs-share.js";
import {
  publicShareLinkApiPath,
  programPath,
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
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
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
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function seedExerciseRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  practitionerId: string,
) {
  await seedApprovedExerciseVersion(storage, practitionerId);
  const rows = new ProgramRowsRepository(storage);
  await rows.replaceRow({
    id: id("row-ex"),
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

function secondApiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
  email: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email,
      displayName: "Other coach",
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

async function snapshotPublishShareState(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
) {
  const programs = new ProgramsRepository(storage);
  const links = new ShareLinksRepository(storage);
  const program = await programs.findById(programId);
  const open = await links.findOpenByProgramId(programId);
  const latest = await links.findLatestByProgramId(programId);
  return {
    published_version: program?.published_version ?? null,
    published_at: program?.published_at ?? null,
    published_snapshot_json: program?.published_snapshot_json ?? null,
    open_link: open
      ? {
          id: open.id,
          token: open.token,
          expires_at: open.expires_at,
          closed_at: open.closed_at,
        }
      : null,
    latest_link_id: latest?.id ?? null,
  };
}

async function readPublicShareLinkResponse(
  deps: ReturnType<typeof apiDeps>["deps"],
  token: string,
): Promise<{ status: number; headers: Headers; bodyText: string }> {
  const response = await handleRequest(
    new Request(`${BASE}${publicShareLinkApiPath(token)}`),
    deps,
  );
  return {
    status: response.status,
    headers: response.headers,
    bodyText: await response.text(),
  };
}

function expectCanonicalUnavailableHttpResponse(result: {
  status: number;
  headers: Headers;
  bodyText: string;
}): void {
  expect(result.status).toBe(200);
  expect(result.headers.get("content-type")).toBe("application/json");
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.bodyText).toBe(PUBLIC_SHARE_LINK_UNAVAILABLE_BODY);
  expect(result.bodyText.length).toBe(PUBLIC_SHARE_LINK_UNAVAILABLE_BODY.length);
}

async function seedPlaceholderRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
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
  const rows = new ProgramRowsRepository(storage);
  await rows.replaceRow({
    id: id("row-ph"),
    programId,
    position: 1,
    exerciseRequestId: requestId,
    prescriptionType: "stretching",
    params: { hold_s: 20 },
    textSnapshot: { title: "Pending row" },
    draftUpdatedAt: TS,
  });
}

describe("DIDI-1011 program publish service (integration)", () => {
  it("publishes, creates a link with default 1 year expiry, and exposes connector state", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: id("prog-pub"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Week one",
      });
      await seedExerciseRow(storage, id("prog-pub"), practitionerId);
      const result = await publish.publishProgram(practitionerId, id("prog-pub"));
      expect(result.share_link).toMatch(new RegExp(`${WEB_BASE}/l/`));
      expect(result.display_state).toBe("published_only");
      const connector = await publish.getShareConnectorView(
        practitionerId,
        id("prog-pub"),
      );
      expect(connector.open_share_link).toBe(true);
      expect(connector.share_link).toBe(result.share_link);
      const open = await new ShareLinksRepository(storage).findOpenByProgramId(
        id("prog-pub"),
      );
      expect(open?.expires_at).toBe(resolveOneYearExpiresAt(new Date(TS)));
    } finally {
      storage.close();
    }
  });

  it("rejects publish without a program name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE);
      await programs.create({
        id: id("prog-noname"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await seedExerciseRow(storage, id("prog-noname"), practitionerId);
      await expect(
        publish.publishProgram(practitionerId, id("prog-noname")),
      ).rejects.toMatchObject({
        code: "name_required",
        message: PROGRAM_PUBLISH_NAME_REQUIRED,
      } satisfies Partial<ProgramPublishServiceError>);
    } finally {
      storage.close();
    }
  });

  it("blocks publish when placeholder rows remain and leaves prior publication unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: id("prog-ph"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Mixed rows",
      });
      await seedExerciseRow(storage, id("prog-ph"), practitionerId);
      await publish.publishProgram(practitionerId, id("prog-ph"));
      const snapBefore = programs.getPublishedSnapshot(
        (await programs.findById(id("prog-ph")))!,
      );
      const linkBefore = await new ShareLinksRepository(storage).findOpenByProgramId(
        id("prog-ph"),
      );
      await seedPlaceholderRow(storage, practitionerId, id("prog-ph"), id("req-ph"));
      await expect(
        programs.publish(id("prog-ph"), "2026-03-03T00:00:00.000Z"),
      ).rejects.toThrow(PUBLISH_BLOCKED_BY_PLACEHOLDERS_MESSAGE);
      await expect(
        publish.publishProgram(practitionerId, id("prog-ph")),
      ).rejects.toMatchObject({
        code: "placeholders_block_publish",
      });
      const snapAfter = programs.getPublishedSnapshot(
        (await programs.findById(id("prog-ph")))!,
      );
      expect(snapAfter).toEqual(snapBefore);
      const linkAfter = await new ShareLinksRepository(storage).findOpenByProgramId(
        id("prog-ph"),
      );
      expect(linkAfter?.token).toBe(linkBefore?.token);
      expect(linkAfter?.expires_at).toBe(linkBefore?.expires_at);
    } finally {
      storage.close();
    }
  });

  it("allows publish after placeholders are removed", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      await programs.create({
        id: id("prog-clear"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Cleared",
      });
      await seedPlaceholderRow(
        storage,
        practitionerId,
        id("prog-clear"),
        id("req-clear"),
      );
      await rows.deleteRow(id("prog-clear"), id("row-ph"), TS);
      await publish.publishProgram(practitionerId, id("prog-clear"));
      expect((await programs.findById(id("prog-clear")))?.published_at).toBeTruthy();
    } finally {
      storage.close();
    }
  });

  it("applies Never, practitioner default, override, and rejects today for custom expiry", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const defaults = new ShareLinksRepository(storage);
      const programs = new ProgramsRepository(storage);
      const publish = new ProgramPublishService(
        storage,
        WEB_BASE,
        () => "2026-04-01T12:00:00.000Z",
      );
      await programs.create({
        id: id("prog-exp"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Expiry",
      });
      await seedExerciseRow(storage, id("prog-exp"), practitionerId);
      await publish.publishProgram(practitionerId, id("prog-exp"), {
        linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      });
      let open = await defaults.findOpenByProgramId(id("prog-exp"));
      expect(open?.expires_at).toBeNull();
      await publish.setProgramLinkExpiry(practitionerId, id("prog-exp"), {
        expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
        customExpiresOn: "2026-04-02",
      });
      open = await defaults.findOpenByProgramId(id("prog-exp"));
      expect(open?.expires_at).toBe(
        resolveShareLinkExpiresAt(
          {
            expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
            customExpiresOn: "2026-04-02",
          },
          new Date("2026-04-01T12:00:00.000Z"),
        ),
      );
      await expect(
        publish.setProgramLinkExpiry(practitionerId, id("prog-exp"), {
          expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
          customExpiresOn: "2026-04-01",
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(GLOBAL_SHARE_LINK_DEFAULT_EXPIRES_IN).toBe(SHARE_LINK_EXPIRES_IN.one_year);
    } finally {
      storage.close();
    }
  });

  it("closes an open link and maps public unavailable views without leaking", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-close"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Close me",
      });
      await seedExerciseRow(storage, id("prog-close"), practitionerId);
      const published = await publish.publishProgram(practitionerId, id("prog-close"));
      const token = published.share_link.split("/l/")[1]!;
      const openView = await publish.getPublicShareLinkByToken(
        decodeURIComponent(token),
      );
      expect(openView.availability).toBe("open");
      if (openView.availability === "open") {
        expect(openView.program_name).toBe("Close me");
      }
      await publish.closeShareLink(practitionerId, id("prog-close"));
      const closedView = await publish.getPublicShareLinkByToken(
        decodeURIComponent(token),
      );
      expect(closedView).toEqual(PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW);
      const unknown = await publish.getPublicShareLinkByToken("not-a-real-token");
      expect(unknown).toEqual(PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW);
      expect(JSON.stringify(unknown)).not.toContain("Close me");
    } finally {
      storage.close();
    }
  });

  it("treats expired links like closed with no leakage", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const publish = new ProgramPublishService(
        storage,
        WEB_BASE,
        () => "2026-01-01T00:00:00.000Z",
      );
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-expired"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Secret name",
      });
      await seedExerciseRow(storage, id("prog-expired"), practitionerId);
      const result = await publish.publishProgram(practitionerId, id("prog-expired"), {
        linkExpiry: {
          expiresIn: SHARE_LINK_EXPIRES_IN.custom_date,
          customExpiresOn: "2026-01-02",
        },
      });
      const token = decodeURIComponent(result.share_link.split("/l/")[1]!);
      const view = await publish.getPublicShareLinkByToken(
        token,
        new Date("2026-01-05T12:00:00.000Z"),
      );
      expect(view).toEqual(PUBLIC_SHARE_LINK_UNAVAILABLE_VIEW);
      expect(JSON.stringify(view)).not.toContain("Secret name");
    } finally {
      storage.close();
    }
  });
});

describe("DIDI-1011 program publish HTTP (integration)", () => {
  it("requires auth for publish but not for the public share link API", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      await programs.create({
        id: id("prog-http"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "HTTP program",
      });
      await seedExerciseRow(storage, id("prog-http"), practitionerId);

      const unauthPublish = await handleRequest(
        new Request(`${BASE}${programPublishPath(id("prog-http"))}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
        deps,
      );
      expect(unauthPublish.status).toBe(401);

      const publishUrl = `${BASE}${programPublishPath(id("prog-http"))}`;
      const authedPublish = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: {
              cookie,
              "content-type": "application/json",
            },
            body: JSON.stringify({}),
          }),
        ),
        deps,
      );
      expect(authedPublish.status).toBe(200);
      const body = (await authedPublish.json()) as { share_link: string };
      const token = decodeURIComponent(body.share_link.split("/l/")[1]!);

      const publicRead = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath(token)}`),
        deps,
      );
      expect(publicRead.status).toBe(200);
      const publicBody = (await publicRead.json()) as { availability: string };
      expect(publicBody.availability).toBe("open");
    } finally {
      storage.close();
    }
  });

  it("updates expiry and closes the link over HTTP", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      await programs.create({
        id: id("prog-share-http"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Share HTTP",
      });
      await seedExerciseRow(storage, id("prog-share-http"), practitionerId);
      const publishShareUrl = `${BASE}${programPublishPath(id("prog-share-http"))}`;
      await handleRequest(
        new Request(
          publishShareUrl,
          mutatingAppApiRequestInit(publishShareUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.never }),
          }),
        ),
        deps,
      );
      const shareUrl = `${BASE}${programShareLinkPath(id("prog-share-http"))}`;
      const patch = await handleRequest(
        new Request(
          shareUrl,
          mutatingAppApiRequestInit(shareUrl, {
            method: "PATCH",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({
              expires_in: SHARE_LINK_EXPIRES_IN.one_week,
            }),
          }),
        ),
        deps,
      );
      expect(patch.status).toBe(200);
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
      expect(del.status).toBe(200);
      const connector = (await del.json()) as { share_link_status: string };
      expect(connector.share_link_status).toBe("closed");
    } finally {
      storage.close();
    }
  });

  it("returns byte-identical unavailable HTTP responses for unknown, closed, expired, never-published, and deleted tokens", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      const publish = new ProgramPublishService(
        storage,
        WEB_BASE,
        () => "2026-06-01T00:00:00.000Z",
      );
      const builder = new ProgramBuilderService(storage);
      const { deps } = apiDeps(storage, practitionerId);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const addFixtureExerciseRow = async (programId: string, rowId: string) => {
        await new ProgramRowsRepository(storage).replaceRow({
          id: rowId,
          programId,
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Heel slide" },
          draftUpdatedAt: TS,
        });
      };

      const unknown = await readPublicShareLinkResponse(
        deps,
        id("missing-share-token"),
      );

      const closedProgramId = id("prog-http-closed");
      await programs.create({
        id: closedProgramId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Closed HTTP",
      });
      await addFixtureExerciseRow(closedProgramId, id("row-http-closed"));
      const closedPublished = await publish.publishProgram(
        practitionerId,
        closedProgramId,
      );
      const closedToken = decodeURIComponent(
        closedPublished.share_link.split("/l/")[1]!,
      );
      await publish.closeShareLink(practitionerId, closedProgramId);
      const closed = await readPublicShareLinkResponse(deps, closedToken);

      const expiredProgramId = id("prog-http-expired");
      await programs.create({
        id: expiredProgramId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Expired HTTP",
      });
      await addFixtureExerciseRow(expiredProgramId, id("row-http-expired"));
      const expiredPublished = await publish.publishProgram(
        practitionerId,
        expiredProgramId,
        {
          linkExpiry: { expiresIn: SHARE_LINK_EXPIRES_IN.never },
        },
      );
      await storage.run(
        `UPDATE share_links SET expires_at = ? WHERE program_id = ? AND closed_at IS NULL`,
        ["2020-01-01T00:00:00.000Z", expiredProgramId],
      );
      const expiredToken = decodeURIComponent(
        expiredPublished.share_link.split("/l/")[1]!,
      );
      const expired = await readPublicShareLinkResponse(deps, expiredToken);

      const neverProgramId = id("prog-http-never");
      await programs.create({
        id: neverProgramId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Never published HTTP",
      });
      await addFixtureExerciseRow(neverProgramId, id("row-http-never"));
      const neverLink = await links.createOpenLinkForProgram({
        id: generateOpaqueEntityId(),
        programId: neverProgramId,
        practitionerId,
        createdAt: TS,
      });
      const neverPublished = await readPublicShareLinkResponse(deps, neverLink.token);

      const deletedProgramId = id("prog-http-deleted");
      await programs.create({
        id: deletedProgramId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Deleted HTTP",
      });
      await addFixtureExerciseRow(deletedProgramId, id("row-http-deleted"));
      const deletedPublished = await publish.publishProgram(
        practitionerId,
        deletedProgramId,
      );
      const deletedToken = decodeURIComponent(
        deletedPublished.share_link.split("/l/")[1]!,
      );
      await builder.deleteProgram(practitionerId, deletedProgramId);
      const deleted = await readPublicShareLinkResponse(deps, deletedToken);

      const malformedResponse = await handleRequest(
        new Request(`${BASE}/api/public/share-links/%E0%A4%A`),
        deps,
      );
      const malformed = {
        status: malformedResponse.status,
        headers: malformedResponse.headers,
        bodyText: await malformedResponse.text(),
      };

      for (const result of [
        unknown,
        closed,
        expired,
        neverPublished,
        deleted,
        malformed,
      ]) {
        expectCanonicalUnavailableHttpResponse(result);
      }
      expect(
        new Set([
          unknown.bodyText,
          closed.bodyText,
          expired.bodyText,
          neverPublished.bodyText,
          deleted.bodyText,
          malformed.bodyText,
        ]).size,
      ).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("publishes over HTTP after a placeholder is approved and linked (DIDI-1104)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("pub-owner"),
        "owner@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("pub-appr"),
        "appr@example.com",
      );
      await seedApprovedExerciseVersion(storage, approver);
      const requests = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T11:00:00.000Z",
      });
      const submitted = await requests.submitRequest({
        practitionerId: owner,
        requestedName: "Approved move",
        formOpenedAt: "2026-10-30T10:00:00.000Z",
      });
      expect(submitted.outcome).toBe("created");
      if (submitted.outcome !== "created") {
        throw new Error("expected created request");
      }

      const programId = id("prog-appr-http");
      const rowId = id("row-appr-http");
      const builder = new ProgramBuilderService(storage);
      await builder.createProgram(owner, { programId, name: "After approve" });
      await builder.addPlaceholderRow(owner, programId, {
        rowId,
        exerciseRequestId: submitted.request_id,
        prescriptionType: "stretching",
      });

      const approve = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T15:00:00.000Z",
      });
      await approve.approveRequest({
        practitionerId: approver,
        requestId: submitted.request_id,
      });

      const row = await new ProgramRowsRepository(storage).findById(rowId);
      expect(row?.exercise_request_id).toBeNull();
      expect(row?.exercise_version_id).not.toBeNull();

      const { deps, cookie } = apiDeps(storage, owner);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const published = await handleRequest(
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
      expect(published.status).toBe(200);
      expect(
        (await new ProgramsRepository(storage).findById(programId))?.published_at,
      ).toBeTruthy();
    } finally {
      storage.close();
    }
  });

  it("rejects the first publish while a placeholder is pending and creates no share link", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const programId = id("prog-first-ph");
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Placeholder only",
      });
      await seedPlaceholderRow(storage, practitionerId, programId, id("req-first-ph"));

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
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("placeholders_block_publish");

      const linkCount = await storage.first<{ c: number }>(
        `SELECT COUNT(*) AS c FROM share_links WHERE program_id = ?`,
        [programId],
      );
      expect(linkCount?.c ?? 0).toBe(0);
      expect((await programs.findById(programId))?.published_version).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("does not change published_version or share-link state on read-only share-link traffic or program save", async () => {
    const storage = await openMigratedDatabase();
    try {
      const ownerId = await seedPractitioner(
        storage,
        id("owner-sfx"),
        "owner@example.com",
      );
      const otherId = await seedPractitioner(
        storage,
        id("other-sfx"),
        "other@example.com",
      );
      const programId = id("prog-sfx");
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: programId,
        createdBy: ownerId,
        createdAt: TS,
        name: "Side effect guard",
      });
      await seedExerciseRow(storage, programId, ownerId);

      const { deps: ownerDeps, cookie: ownerCookie } = apiDeps(storage, ownerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const published = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie: ownerCookie, "content-type": "application/json" },
            body: JSON.stringify({}),
          }),
        ),
        ownerDeps,
      );
      expect(published.status).toBe(200);
      const publishBody = (await published.json()) as { share_link: string };
      const token = decodeURIComponent(publishBody.share_link.split("/l/")[1]!);

      const before = await snapshotPublishShareState(storage, programId);

      const shareUrl = `${BASE}${programShareLinkPath(programId)}`;
      const ownerShare = await handleRequest(
        new Request(shareUrl, {
          headers: { cookie: ownerCookie },
        }),
        ownerDeps,
      );
      expect(ownerShare.status).toBe(200);

      const { deps: otherDeps, cookie: otherCookie } = secondApiDeps(
        storage,
        otherId,
        "other@example.com",
      );
      const otherShare = await handleRequest(
        new Request(shareUrl, {
          headers: { cookie: otherCookie },
        }),
        otherDeps,
      );
      expect(otherShare.status).toBe(404);

      const publicRead = await readPublicShareLinkResponse(ownerDeps, token);
      expect(publicRead.status).toBe(200);

      const patchUrl = `${BASE}${programPath(programId)}`;
      const saved = await handleRequest(
        new Request(
          patchUrl,
          mutatingAppApiRequestInit(patchUrl, {
            method: "PATCH",
            headers: { cookie: ownerCookie },
            body: JSON.stringify({ name: "Renamed side effect guard" }),
          }),
        ),
        ownerDeps,
      );
      expect(saved.status).toBe(200);

      const after = await snapshotPublishShareState(storage, programId);
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });
});
