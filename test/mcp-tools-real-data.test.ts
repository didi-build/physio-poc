import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  buildWebAppExerciseSearchUrl,
} from "../src/mcp-connector/index.js";
import { handleRequest } from "../src/http/app.js";
import { invokePhysioMcpTool } from "../src/services/mcp/tool-handler.js";
import { PhysioMcpStructuredToolError } from "../src/services/mcp/validate-tool-input.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { ProgramPublishService } from "../src/services/programs/program-publish-service.js";
import {
  ProgramsRepository,
  ProgramRowsRepository,
} from "../src/storage/repositories/programs.js";
import {
  applyMigration,
  MIGRATION_0004_ID,
  MIGRATION_0006_ID,
} from "../src/storage/migrations/apply.js";
import {
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import {
  MCP_TEST_CONFIG,
  MCP_TEST_BASE,
  createTestPhysioMcpHttpHandler,
  toolErrorText,
  withMcpClient,
} from "./mcp-server-test-utils.js";
import { MCP_PATH } from "../src/http/app.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import { mcpOAuthResourceUrl } from "../src/auth/mcp-oauth/paths.js";
import type { AppDependencies } from "../src/http/app.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import type { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  createMcpBearerAuthHandler,
  createNodeAuthPort,
} from "../src/adapters/node/create-auth-port.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import {
  CHATGPT_CIMD_CLIENT_ID,
  mcpRequestHeaders,
  signTestMcpAccessToken,
} from "./helpers/mcp-oauth-test-utils.js";

const BASE = MCP_TEST_BASE;
const PINNED_NOW = "2026-10-31T12:00:00.000Z";
const PINNED_EXPIRED = "2026-10-31T11:59:59.999Z";
const PINNED_JUST_BEFORE_EXPIRY = "2026-10-31T12:00:01.000Z";
const MISSING_PROGRAM_CODE = "PRG-ZZZZ";
const REPO_ROOT = join(import.meta.dirname, "..");
const MIGRATION_0004_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0004_better_auth.sql"),
  "utf8",
);
const MIGRATION_0006_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0006_mcp_oauth.sql"),
  "utf8",
);

async function ensureMcpBearerSchema(sql: SqlStoragePort): Promise<void> {
  await applyMigration(sql, MIGRATION_0004_ID, MIGRATION_0004_SQL);
  await applyMigration(sql, MIGRATION_0006_ID, MIGRATION_0006_SQL);
}

async function snapshotProgramShareTables(sql: SqlStoragePort) {
  const programs = await sql.all(`SELECT * FROM programs ORDER BY id`);
  const shareLinks = await sql.all(`SELECT * FROM share_links ORDER BY id`);
  return { programs, shareLinks };
}

async function createProductionStyleMcpDeps(
  storage: BetterSqliteStorage,
): Promise<AppDependencies> {
  const config = resolveTestPhysioServerConfig(PHYSIO_TEST_BETTER_AUTH_SECRET, {
    fakeGoogleProvider: false,
    authBaseUrl: MCP_TEST_BASE,
    webAppBaseUrl: MCP_TEST_CONFIG.webAppBaseUrl,
  });
  const authBundle = createNodeAuthPort(storage.nativeDatabase(), storage, config, {
    cimdMetadataFetch: async () => new Response(null, { status: 404 }),
  });
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config,
    auth: authBundle.auth,
    mcp: createTestPhysioMcpHttpHandler(storage, config),
    mcpBearerAuth: createMcpBearerAuthHandler(authBundle, config, storage),
  };
}

async function seedBearerMcpAccessToken(
  deps: AppDependencies,
  practitionerId: string,
  email: string,
): Promise<string> {
  const userId = generateOpaqueEntityId();
  const sessionId = generateOpaqueEntityId();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  await deps.sql.run(
    `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, "practitionerId")
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, "Bearer MCP", email, 1, now, now, practitionerId],
  );
  await deps.sql.run(
    `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, expiresAt, generateOpaqueEntityId(), now, now, userId],
  );
  const authBase = MCP_TEST_BASE.replace(/\/$/, "");
  return signTestMcpAccessToken(deps, {
    sid: sessionId,
    sub: userId,
    aud: [mcpOAuthResourceUrl(MCP_TEST_BASE)],
    azp: CHATGPT_CIMD_CLIENT_ID,
    iss: `${authBase}/api/auth`,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

async function seedExerciseRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  practitionerId: string,
  options?: { skipApprovedSeed?: boolean },
) {
  if (!options?.skipApprovedSeed) {
    await seedApprovedExerciseVersion(storage, practitionerId);
  }
  const rows = new ProgramRowsRepository(storage);
  await rows.replaceRow({
    id: id(`row-ex-${programId.slice(-8)}`),
    programId,
    position: 0,
    exerciseId: "22222222-2222-4222-8222-222222222222",
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30 },
    textSnapshot: { title: "Heel slide" },
    draftUpdatedAt: TS,
  });
}

function mcpDepsOnStorage(
  storage: BetterSqliteStorage,
  practitionerId: string,
  email: string,
) {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "MCP QA" },
    sessionCookieName: `physio.fake_session.${practitionerId}`,
  });
  return {
    storage,
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function migratedMcpDeps(practitionerId: string, email: string) {
  const storage = await openMigratedDatabase();
  await seedPractitioner(storage, practitionerId, email);
  return mcpDepsOnStorage(storage, practitionerId, email);
}

describe("MCP tools with real data (DIDI-1016)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 for unauthenticated /mcp", async () => {
    const storage = await openMigratedDatabase();
    const practitionerId = await seedPractitioner(storage);
    const { deps } = await migratedMcpDeps(practitionerId, "owner@example.com");
    const response = await handleRequest(
      new Request(`${BASE}${MCP_PATH}`, { method: "POST", body: "{}" }),
      deps,
    );
    expect(response.status).toBe(401);
  });

  it("invokePhysioMcpTool returns auth_required when the practitioner header is missing", async () => {
    const storage = await openMigratedDatabase();
    let error: unknown;
    try {
      await invokePhysioMcpTool(
        SEARCH_APPROVED_EXERCISES_TOOL_NAME,
        { query: "calf" },
        new Request(`${BASE}${MCP_PATH}`, { method: "POST" }),
        { sql: storage, config: MCP_TEST_CONFIG },
      );
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PhysioMcpStructuredToolError);
    expect((error as PhysioMcpStructuredToolError).structured).toEqual({
      error_code: "auth_required",
    });
    expect((error as PhysioMcpStructuredToolError).message).toBe("auth_required");
  });

  it("search_approved_exercises returns real rows and search_link when empty", async () => {
    const practitionerId = testOpaqueEntityId("mcp-search-owner");
    const { deps, cookie } = await migratedMcpDeps(
      practitionerId,
      "search@example.com",
    );
    await seedApprovedExerciseVersion(deps.sql, practitionerId);
    await deps.sql.run(
      `UPDATE exercise_versions SET title = 'Standing calf stretch' WHERE id = ?`,
      [FIXTURE_VERSION_ID],
    );

    await withMcpClient(
      async (client) => {
        const hit = await client.callTool({
          name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
          arguments: { query: "calf" },
        });
        expect(hit.isError).not.toBe(true);
        const body = hit.structuredContent as {
          exercises?: { exercise_name?: string }[];
          summary?: string;
        };
        expect(body.summary).toMatch(/Searched exercise library/);
        expect(body.exercises?.length).toBeGreaterThan(0);

        const miss = await client.callTool({
          name: SEARCH_APPROVED_EXERCISES_TOOL_NAME,
          arguments: { query: "zzzz-no-match-mcp-1016" },
        });
        const missBody = miss.structuredContent as {
          exercises?: unknown[];
          search_link?: string;
        };
        expect(missBody.exercises).toEqual([]);
        expect(missBody.search_link).toBe(
          buildWebAppExerciseSearchUrl(
            MCP_TEST_CONFIG.webAppBaseUrl,
            "zzzz-no-match-mcp-1016",
          ),
        );
      },
      {
        fetch: async (input, init) => {
          const parsed = new URL(input instanceof URL ? input.href : input);
          const headers = new Headers(init?.headers);
          headers.set("cookie", cookie);
          return handleRequest(
            new Request(`${BASE}${parsed.pathname}${parsed.search}`, {
              method: init?.method ?? "GET",
              headers,
              body: init?.body ?? undefined,
            }),
            deps,
          );
        },
      },
    );
  });

  it("get_program_share_link_or_pdf covers draft, published, and draft plus published", async () => {
    const practitionerId = testOpaqueEntityId("mcp-share-owner");
    const { deps, cookie } = await migratedMcpDeps(practitionerId, "share@example.com");
    const builder = new ProgramBuilderService(deps.sql);
    const publish = new ProgramPublishService(
      deps.sql,
      MCP_TEST_CONFIG.webAppBaseUrl,
      () => TS,
    );
    const programs = new ProgramsRepository(deps.sql);
    await seedApprovedExerciseVersion(deps.sql, practitionerId);

    const draftProgramId = id("mcp-share-draft");
    await programs.create({
      id: draftProgramId,
      createdBy: practitionerId,
      createdAt: TS,
      name: "Draft only",
    });
    await seedExerciseRow(deps.sql, draftProgramId, practitionerId, {
      skipApprovedSeed: true,
    });
    const draftCode = (await programs.findById(draftProgramId))!.code;

    const publishedProgramId = id("mcp-share-pub");
    await programs.create({
      id: publishedProgramId,
      createdBy: practitionerId,
      createdAt: TS,
      name: "Published only",
    });
    await seedExerciseRow(deps.sql, publishedProgramId, practitionerId, {
      skipApprovedSeed: true,
    });
    await publish.publishProgram(practitionerId, publishedProgramId);
    const publishedCode = (await programs.findById(publishedProgramId))!.code;

    const bothProgramId = id("mcp-share-both");
    await programs.create({
      id: bothProgramId,
      createdBy: practitionerId,
      createdAt: TS,
      name: "Both states",
    });
    await seedExerciseRow(deps.sql, bothProgramId, practitionerId, {
      skipApprovedSeed: true,
    });
    await publish.publishProgram(practitionerId, bothProgramId);
    const bothCode = (await programs.findById(bothProgramId))!.code;
    await builder.addExerciseRow(practitionerId, bothProgramId, {
      rowId: id("mcp-share-both-row"),
      exerciseId: "22222222-2222-4222-8222-222222222222",
      exerciseVersionId: FIXTURE_VERSION_ID,
      prescriptionType: "stretching",
      params: { hold_s: 20 },
    });

    await withMcpClient(
      async (client) => {
        const draftResult = await client.callTool({
          name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
          arguments: { program_code: draftCode },
        });
        const draftBody = draftResult.structuredContent as Record<string, unknown>;
        expect(draftBody.share_link).toBe("");
        expect(draftBody.pdf_url).toBe("");
        expect(String(draftBody.publish_link)).toContain("/publish");

        const pubResult = await client.callTool({
          name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
          arguments: { program_code: publishedCode },
        });
        const pubBody = pubResult.structuredContent as Record<string, unknown>;
        expect(String(pubBody.share_link)).toMatch(/\/l\//);
        expect(String(pubBody.pdf_url)).toMatch(/\.pdf$/);
        expect(pubBody.publish_link).toBe("");

        const bothResult = await client.callTool({
          name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
          arguments: { program_code: bothCode },
        });
        const bothBody = bothResult.structuredContent as Record<string, unknown>;
        expect(String(bothBody.share_link)).toMatch(/\/l\//);
        expect(String(bothBody.publish_link)).toContain("/publish");
        expect(bothBody.draft).not.toBeNull();
        expect(bothBody.published).not.toBeNull();
      },
      {
        baseUrl: BASE,
        fetch: async (input, init) => {
          const parsed = new URL(input instanceof URL ? input.href : input);
          const headers = new Headers(init?.headers);
          headers.set("cookie", cookie);
          return handleRequest(
            new Request(`${BASE}${parsed.pathname}${parsed.search}`, {
              method: init?.method ?? "GET",
              headers,
              body: init?.body ?? undefined,
            }),
            deps,
          );
        },
      },
    );
  });

  it("get_program_builder_link returns a real summary for an owned program_code", async () => {
    const practitionerId = testOpaqueEntityId("mcp-builder-owner");
    const { deps, cookie } = await migratedMcpDeps(
      practitionerId,
      "builder@example.com",
    );
    const programs = new ProgramsRepository(deps.sql);
    const programId = id("mcp-builder-prog");
    await programs.create({
      id: programId,
      createdBy: practitionerId,
      createdAt: TS,
      name: "Week one",
    });
    await seedExerciseRow(deps.sql, programId, practitionerId);
    const code = (await programs.findById(programId))!.code;

    await withMcpClient(
      async (client) => {
        const result = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { program_code: code },
        });
        const body = result.structuredContent as {
          summary?: string;
          program_code?: string;
        };
        expect(body.summary).toMatch(/Found program by code/);
        expect(body.program_code).toBe(code);
      },
      {
        fetch: async (input, init) => {
          const parsed = new URL(input instanceof URL ? input.href : input);
          const headers = new Headers(init?.headers);
          headers.set("cookie", cookie);
          return handleRequest(
            new Request(`${BASE}${parsed.pathname}${parsed.search}`, {
              method: init?.method ?? "GET",
              headers,
              body: init?.body ?? undefined,
            }),
            deps,
          );
        },
      },
    );
  });

  it("get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url for expired, closed, boundary, and superseded links", async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PINNED_NOW));
    try {
      const practitionerId = testOpaqueEntityId("mcp-inactive-links");
      const { deps, cookie, storage } = await migratedMcpDeps(
        practitionerId,
        "inactive-links@example.com",
      );
      const programs = new ProgramsRepository(deps.sql);
      const publish = new ProgramPublishService(
        deps.sql,
        MCP_TEST_CONFIG.webAppBaseUrl,
        () => PINNED_NOW,
      );

      const mcpFetch =
        (requestCookie: string): FetchLike =>
        async (input, init) => {
          const parsed = new URL(input instanceof URL ? input.href : input);
          const headers = new Headers(init?.headers);
          headers.set("cookie", requestCookie);
          return handleRequest(
            new Request(`${BASE}${parsed.pathname}${parsed.search}`, {
              method: init?.method ?? "GET",
              headers,
              body: init?.body ?? undefined,
            }),
            deps,
          );
        };

      const assertNoLiveShareOrPdf = (body: Record<string, unknown>, label: string) => {
        expect(body.share_link_state, label).not.toBe("live");
        expect(["closed", "expired", "none"], label).toContain(body.share_link_state);
        expect(body.share_link, label).toBe("");
        expect(body.pdf_url, label).toBe("");
        expect(String(body.share_link), label).not.toMatch(/\/l\//);
      };

      await seedApprovedExerciseVersion(deps.sql, practitionerId);

      const createPublishedProgram = async (suffix: string, name: string) => {
        const programId = id(`mcp-inactive-${suffix}`);
        await programs.create({
          id: programId,
          createdBy: practitionerId,
          createdAt: TS,
          name,
        });
        await seedExerciseRow(deps.sql, programId, practitionerId, {
          skipApprovedSeed: true,
        });
        await publish.publishProgram(practitionerId, programId);
        const code = (await programs.findById(programId))!.code;
        return { programId, code };
      };

      const { code: expiredCode, programId: expiredProgramId } =
        await createPublishedProgram("expired", "Expired link");
      await deps.sql.run(
        `UPDATE share_links SET expires_at = ? WHERE program_id = ? AND closed_at IS NULL`,
        [PINNED_EXPIRED, expiredProgramId],
      );

      const { code: closedCode, programId: closedProgramId } =
        await createPublishedProgram("closed", "Closed link");
      await publish.closeShareLink(practitionerId, closedProgramId);

      const { code: boundaryCode, programId: boundaryProgramId } =
        await createPublishedProgram("boundary", "Boundary expiry");
      await deps.sql.run(
        `UPDATE share_links SET expires_at = ? WHERE program_id = ? AND closed_at IS NULL`,
        [PINNED_NOW, boundaryProgramId],
      );

      const { code: supersededCode, programId: supersededProgramId } =
        await createPublishedProgram("superseded", "Superseded tokens");
      await publish.closeShareLink(practitionerId, supersededProgramId);
      await publish.publishProgram(practitionerId, supersededProgramId);
      await publish.closeShareLink(practitionerId, supersededProgramId);

      const assertConnectorViewInactive = async (
        programId: string,
        expectedState: "closed" | "expired",
        label: string,
      ) => {
        const view = await publish.getShareConnectorView(practitionerId, programId);
        expect(view.share_link_state, label).toBe(expectedState);
        expect(view.share_link, label).toBe("");
        expect(view.open_share_link, label).toBe(false);
      };

      await assertConnectorViewInactive(expiredProgramId, "expired", "expired-view");
      await assertConnectorViewInactive(closedProgramId, "closed", "closed-view");
      await assertConnectorViewInactive(boundaryProgramId, "expired", "boundary-view");
      await assertConnectorViewInactive(
        supersededProgramId,
        "closed",
        "superseded-view",
      );

      const { code: liveSoonCode, programId: liveSoonProgramId } =
        await createPublishedProgram("live-soon", "Just before expiry");
      await deps.sql.run(
        `UPDATE share_links SET expires_at = ? WHERE program_id = ? AND closed_at IS NULL`,
        [PINNED_JUST_BEFORE_EXPIRY, liveSoonProgramId],
      );

      const republishProgramId = id("mcp-inactive-republish");
      await programs.create({
        id: republishProgramId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Republish open link",
      });
      await seedExerciseRow(deps.sql, republishProgramId, practitionerId, {
        skipApprovedSeed: true,
      });
      const firstPublish = await publish.publishProgram(
        practitionerId,
        republishProgramId,
      );
      const supersededToken = decodeURIComponent(
        firstPublish.share_link.split("/l/")[1]!,
      );
      await publish.closeShareLink(practitionerId, republishProgramId);
      const secondPublish = await publish.publishProgram(
        practitionerId,
        republishProgramId,
      );
      const currentOpenToken = decodeURIComponent(
        secondPublish.share_link.split("/l/")[1]!,
      );
      expect(currentOpenToken).not.toBe(supersededToken);
      expect(String(secondPublish.share_link)).toMatch(/\/l\//);
      const openRow = await deps.sql.first<{ token: string }>(
        `SELECT token FROM share_links WHERE program_id = ? AND closed_at IS NULL LIMIT 1`,
        [republishProgramId],
      );
      expect(openRow?.token).toBe(currentOpenToken);

      const beforeTables = await snapshotProgramShareTables(deps.sql);

      await withMcpClient(
        async (client) => {
          for (const [label, code] of [
            ["expired", expiredCode],
            ["closed", closedCode],
            ["boundary", boundaryCode],
            ["superseded", supersededCode],
          ] as const) {
            const result = await client.callTool({
              name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
              arguments: { program_code: code },
            });
            expect(result.isError, label).not.toBe(true);
            assertNoLiveShareOrPdf(
              result.structuredContent as Record<string, unknown>,
              label,
            );
          }

          const liveSoon = await client.callTool({
            name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
            arguments: { program_code: liveSoonCode },
          });
          const liveSoonBody = liveSoon.structuredContent as Record<string, unknown>;
          expect(String(liveSoonBody.share_link)).toMatch(/\/l\//);
          expect(String(liveSoonBody.pdf_url)).toMatch(/\.pdf$/);
        },
        { baseUrl: BASE, fetch: mcpFetch(cookie) },
      );

      const afterTables = await snapshotProgramShareTables(deps.sql);
      expect(afterTables).toEqual(beforeTables);

      await ensureMcpBearerSchema(deps.sql);
      const bearerDeps = await createProductionStyleMcpDeps(storage);
      const bearerToken = await seedBearerMcpAccessToken(
        bearerDeps,
        practitionerId,
        "inactive-links@example.com",
      );
      const bearerMcpFetch: FetchLike = async (input, init) => {
        const parsed = new URL(input instanceof URL ? input.href : input);
        const headers = new Headers(init?.headers);
        for (const [key, value] of Object.entries(mcpRequestHeaders(bearerToken))) {
          headers.set(key, value);
        }
        return handleRequest(
          new Request(`${MCP_TEST_BASE}${parsed.pathname}${parsed.search}`, {
            method: init?.method ?? "GET",
            headers,
            body: init?.body ?? undefined,
          }),
          bearerDeps,
        );
      };

      await withMcpClient(
        async (client) => {
          const closedBearer = await client.callTool({
            name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
            arguments: { program_code: closedCode },
          });
          expect(closedBearer.isError).not.toBe(true);
          assertNoLiveShareOrPdf(
            closedBearer.structuredContent as Record<string, unknown>,
            "closed-bearer",
          );
        },
        { baseUrl: MCP_TEST_BASE, fetch: bearerMcpFetch },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("cross-owner get_program_builder_link matches missing-code not-found and does not leak owner data", async () => {
    const storage = await openMigratedDatabase();
    const ownerA = testOpaqueEntityId("mcp-builder-owner-a");
    const ownerB = testOpaqueEntityId("mcp-builder-owner-b");
    await seedPractitioner(storage, ownerA, "buildera@example.com");
    await seedPractitioner(storage, ownerB, "builderb@example.com");
    const ownerBDeps = mcpDepsOnStorage(storage, ownerB, "builderb@example.com");
    const programs = new ProgramsRepository(storage);
    const programId = id("mcp-builder-cross");
    await programs.create({
      id: programId,
      createdBy: ownerA,
      createdAt: TS,
      name: "Owner A only",
    });
    const ownerProgramCode = (await programs.findById(programId))!.code;

    const mcpFetch =
      (sessionDeps: typeof ownerBDeps): FetchLike =>
      async (input, init) => {
        const parsed = new URL(input instanceof URL ? input.href : input);
        const headers = new Headers(init?.headers);
        headers.set("cookie", sessionDeps.cookie);
        return handleRequest(
          new Request(`${BASE}${parsed.pathname}${parsed.search}`, {
            method: init?.method ?? "GET",
            headers,
            body: init?.body ?? undefined,
          }),
          sessionDeps.deps,
        );
      };

    const expectCrossOwnerBuilderNotFound = async (
      client: Parameters<Parameters<typeof withMcpClient>[0]>[0],
    ) => {
      const missing = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { program_code: MISSING_PROGRAM_CODE },
      });
      const foreign = await client.callTool({
        name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
        arguments: { program_code: ownerProgramCode },
      });
      expect(missing.isError).toBe(true);
      expect(foreign.isError).toBe(true);
      expect(toolErrorText(foreign)).toBe(toolErrorText(missing));
      expect(toolErrorText(foreign)).toMatch(/Program not found/i);
      expect(foreign.structuredContent).toBeFalsy();
    };

    await withMcpClient(async (client) => expectCrossOwnerBuilderNotFound(client), {
      fetch: mcpFetch(ownerBDeps),
    });

    await ensureMcpBearerSchema(storage);
    const bearerDeps = await createProductionStyleMcpDeps(storage);
    const bearerToken = await seedBearerMcpAccessToken(
      bearerDeps,
      ownerB,
      "builderb@example.com",
    );
    const bearerMcpFetch: FetchLike = async (input, init) => {
      const parsed = new URL(input instanceof URL ? input.href : input);
      const headers = new Headers(init?.headers);
      for (const [key, value] of Object.entries(mcpRequestHeaders(bearerToken))) {
        headers.set(key, value);
      }
      return handleRequest(
        new Request(`${MCP_TEST_BASE}${parsed.pathname}${parsed.search}`, {
          method: init?.method ?? "GET",
          headers,
          body: init?.body ?? undefined,
        }),
        bearerDeps,
      );
    };

    await withMcpClient(async (client) => expectCrossOwnerBuilderNotFound(client), {
      baseUrl: MCP_TEST_BASE,
      fetch: bearerMcpFetch,
    });
  });

  it("cross-owner program_code returns Program not found", async () => {
    const storage = await openMigratedDatabase();
    const ownerA = testOpaqueEntityId("mcp-owner-a");
    const ownerB = testOpaqueEntityId("mcp-owner-b");
    await seedPractitioner(storage, ownerA, "a@example.com");
    await seedPractitioner(storage, ownerB, "b@example.com");
    const ownerBDeps = mcpDepsOnStorage(storage, ownerB, "b@example.com");
    const programs = new ProgramsRepository(storage);
    const programId = id("mcp-cross-owner");
    await programs.create({
      id: programId,
      createdBy: ownerA,
      createdAt: TS,
      name: "Private",
    });
    const ownerProgramCode = (await programs.findById(programId))!.code;

    await withMcpClient(
      async (client) => {
        const result = await client.callTool({
          name: GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
          arguments: { program_code: ownerProgramCode },
        });
        expect(result.isError).toBe(true);
      },
      {
        fetch: async (input, init) => {
          const parsed = new URL(input instanceof URL ? input.href : input);
          const headers = new Headers(init?.headers);
          headers.set("cookie", ownerBDeps.cookie);
          return handleRequest(
            new Request(`${BASE}${parsed.pathname}${parsed.search}`, {
              method: init?.method ?? "GET",
              headers,
              body: init?.body ?? undefined,
            }),
            ownerBDeps.deps,
          );
        },
      },
    );
  });

  it("production-style /mcp rejects missing bearer with 401", async () => {
    const deps = await createNodeAppDependencies({
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
    });
    expect(deps.mcpBearerAuth).toBeDefined();
    const response = await handleRequest(
      new Request(`${MCP_TEST_CONFIG.auth.authBaseUrl}/mcp`, {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      deps,
    );
    expect(response.status).toBe(401);
  });
});
