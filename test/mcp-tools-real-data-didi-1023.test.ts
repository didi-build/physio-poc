import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  SEARCH_ROUTINES_TOOL_NAME,
  buildProgramBuilderLink,
} from "../src/mcp-connector/index.js";
import { handleRequest } from "../src/http/app.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import type { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  MCP_TEST_BASE,
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
  toolErrorText,
  withMcpClient,
} from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { id, testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { publishRoutine } from "./helpers/from-routine-http-fixture.js";
import { RoutinesRepository } from "../src/storage/repositories/routines.js";
import {
  createMcpBearerAuthHandler,
  createNodeAuthPort,
} from "../src/adapters/node/create-auth-port.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import {
  CHATGPT_CIMD_CLIENT_ID,
  mcpRequestHeaders,
  signTestMcpAccessToken,
} from "./helpers/mcp-oauth-test-utils.js";
import { mcpOAuthResourceUrl } from "../src/auth/mcp-oauth/paths.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import type { AppDependencies } from "../src/http/app.js";
import {
  applyMigration,
  MIGRATION_0004_ID,
  MIGRATION_0006_ID,
} from "../src/storage/migrations/apply.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = MCP_TEST_BASE;
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

async function snapshotMcpRoutineRelatedTables(sql: SqlStoragePort) {
  return {
    routines: await sql.all(`SELECT * FROM routines ORDER BY id`),
    routine_versions: await sql.all(`SELECT * FROM routine_versions ORDER BY id`),
    routine_version_rows: await sql.all(
      `SELECT * FROM routine_version_rows ORDER BY id`,
    ),
    practitioner_routines: await sql.all(
      `SELECT * FROM practitioner_routines ORDER BY id`,
    ),
    practitioner_routine_rows: await sql.all(
      `SELECT * FROM practitioner_routine_rows ORDER BY id`,
    ),
    programs: await sql.all(`SELECT * FROM programs ORDER BY id`),
    program_rows: await sql.all(`SELECT * FROM program_rows ORDER BY id`),
    share_links: await sql.all(`SELECT * FROM share_links ORDER BY id`),
  };
}

function mcpDepsOnStorage(
  storage: BetterSqliteStorage,
  practitionerId: string,
  email: string,
) {
  const auth = new FakeAuthPort({
    practitioner: { practitionerId, email, displayName: "MCP DIDI-1023" },
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

async function seedOwnerPublishedRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  ownerId: string,
  options: { name: string; seed: string },
  options2?: { skipExerciseSeed?: boolean },
): Promise<string> {
  if (!options2?.skipExerciseSeed) {
    await seedApprovedExerciseVersion(storage, ownerId);
  }
  await publishRoutine(storage, ownerId, {
    routine: `didi-1023-${options.seed}`,
    draftVersion: `didi-1023-${options.seed}-draft`,
    row: `didi-1023-${options.seed}-row`,
    name: options.name,
  });
  return id(`didi-1023-${options.seed}`);
}

async function seedOwnerDraftRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  ownerId: string,
): Promise<string> {
  const routines = new RoutinesRepository(storage);
  const routineId = id("didi-1023-draft-only");
  await routines.createDraft({
    id: routineId,
    draftVersionId: id("didi-1023-draft-only-rv"),
    createdBy: ownerId,
    createdAt: "2026-10-29T12:00:00.000Z",
    bodyRegionId: "br-knee",
    name: "Hidden owner draft",
  });
  return routineId;
}

describe("MCP tools with real data (DIDI-1023)", () => {
  it("search_routines and get_program_builder_link leave all routine/program tables unchanged", async () => {
    const storage = await openMigratedDatabase();
    const owner = testOpaqueEntityId("didi-1023-snapshot-owner");
    await seedPractitioner(storage, owner, "snapshot@example.com");
    const publishedId = await seedOwnerPublishedRoutine(storage, owner, {
      name: "Knee bridge starter",
      seed: "snap-pub",
    });
    await seedOwnerDraftRoutine(storage, owner);
    const { deps, cookie } = mcpDepsOnStorage(storage, owner, "snapshot@example.com");

    const mcpFetch: FetchLike = async (input, init) => {
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
    };

    await withMcpClient(
      async (client) => {
        const beforeSearch = await snapshotMcpRoutineRelatedTables(storage);
        const search = await client.callTool({
          name: SEARCH_ROUTINES_TOOL_NAME,
          arguments: { query: "bridge" },
        });
        expect(search.isError).not.toBe(true);
        const afterSearch = await snapshotMcpRoutineRelatedTables(storage);
        expect(afterSearch).toEqual(beforeSearch);

        const beforeBuilder = await snapshotMcpRoutineRelatedTables(storage);
        const builder = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id: publishedId },
        });
        expect(builder.isError).not.toBe(true);
        const afterBuilder = await snapshotMcpRoutineRelatedTables(storage);
        expect(afterBuilder).toEqual(beforeBuilder);
      },
      { fetch: mcpFetch },
    );
  });

  it("search_routines returns only owner published routines and excludes drafts and other owners", async () => {
    const storage = await openMigratedDatabase();
    const ownerA = testOpaqueEntityId("didi-1023-search-a");
    const ownerB = testOpaqueEntityId("didi-1023-search-b");
    await seedPractitioner(storage, ownerA, "searcha@example.com");
    await seedPractitioner(storage, ownerB, "searchb@example.com");
    const aPublished = await seedOwnerPublishedRoutine(storage, ownerA, {
      name: "Owner A bridge flow",
      seed: "search-a-pub",
    });
    await seedOwnerDraftRoutine(storage, ownerA);
    await seedOwnerPublishedRoutine(
      storage,
      ownerB,
      {
        name: "Owner B bridge flow",
        seed: "search-b-pub",
      },
      { skipExerciseSeed: true },
    );
    const { deps, cookie } = mcpDepsOnStorage(storage, ownerA, "searcha@example.com");

    await withMcpClient(
      async (client) => {
        const result = await client.callTool({
          name: SEARCH_ROUTINES_TOOL_NAME,
          arguments: { query: "bridge" },
        });
        expect(result.isError).not.toBe(true);
        const body = result.structuredContent as {
          summary?: string;
          routines?: {
            routine_id: string;
            routine_name: string;
            routine_version: number;
            source?: string;
          }[];
        };
        expect(body.summary).toBe("Searched routines");
        expect(body.routines).toHaveLength(1);
        expect(body.routines![0]).toMatchObject({
          routine_id: aPublished,
          routine_name: "Owner A bridge flow",
          routine_version: 1,
          source: "community",
        });
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

  it("get_program_builder_link from_routine_id returns exact program-new deep link", async () => {
    const storage = await openMigratedDatabase();
    const owner = testOpaqueEntityId("didi-1023-deeplink");
    await seedPractitioner(storage, owner, "deeplink@example.com");
    const routineId = await seedOwnerPublishedRoutine(storage, owner, {
      name: "Deep link routine",
      seed: "deeplink",
    });
    const { deps, cookie } = mcpDepsOnStorage(storage, owner, "deeplink@example.com");
    const expected = buildProgramBuilderLink(MCP_TEST_CONFIG.webAppBaseUrl, {
      from_routine_id: routineId,
    });

    await withMcpClient(
      async (client) => {
        const result = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id: routineId },
        });
        expect(result.isError).not.toBe(true);
        const body = result.structuredContent as {
          builder_link?: string;
          from_routine_id?: string;
          summary?: string;
        };
        expect(body.builder_link).toBe(expected);
        expect(body.builder_link).toBe(
          `${MCP_TEST_CONFIG.webAppBaseUrl}/programs/new?from_routine_id=${routineId}`,
        );
        expect(body.from_routine_id).toBe(routineId);
        expect(body.summary).toBe("Created program from routine");
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

  it("cross-owner routine search and from_routine_id match missing-id not-found without leak", async () => {
    const storage = await openMigratedDatabase();
    const ownerA = testOpaqueEntityId("didi-1023-xowner-a");
    const ownerB = testOpaqueEntityId("didi-1023-xowner-b");
    await seedPractitioner(storage, ownerA, "xownera@example.com");
    await seedPractitioner(storage, ownerB, "xownerb@example.com");
    const foreignRoutine = await seedOwnerPublishedRoutine(storage, ownerA, {
      name: "Foreign published",
      seed: "xowner-foreign",
    });
    const missingRoutine = testOpaqueEntityId("didi-1023-missing-routine");
    const { deps, cookie } = mcpDepsOnStorage(storage, ownerB, "xownerb@example.com");

    const mcpFetch: FetchLike = async (input, init) => {
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
    };

    await withMcpClient(
      async (client) => {
        const foreignSearch = await client.callTool({
          name: SEARCH_ROUTINES_TOOL_NAME,
          arguments: { query: "Foreign" },
        });
        expect(foreignSearch.isError).not.toBe(true);
        const searchBody = foreignSearch.structuredContent as {
          routines?: unknown[];
        };
        expect(searchBody.routines).toEqual([]);

        const missingBuilder = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id: missingRoutine },
        });
        const foreignBuilder = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id: foreignRoutine },
        });
        expect(missingBuilder.isError).toBe(true);
        expect(foreignBuilder.isError).toBe(true);
        expect(toolErrorText(foreignBuilder)).toBe(toolErrorText(missingBuilder));
        expect(toolErrorText(foreignBuilder)).toMatch(/Routine not found/i);
        expect(foreignBuilder.structuredContent).toBeFalsy();
      },
      { fetch: mcpFetch },
    );

    await ensureMcpBearerSchema(storage);
    const bearerDeps = await createProductionStyleMcpDeps(storage);
    const bearerToken = await seedBearerMcpAccessToken(
      bearerDeps,
      ownerB,
      "xownerb@example.com",
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
        const result = await client.callTool({
          name: GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
          arguments: { from_routine_id: foreignRoutine },
        });
        expect(result.isError).toBe(true);
        expect(toolErrorText(result)).toMatch(/Routine not found/i);
      },
      { baseUrl: MCP_TEST_BASE, fetch: bearerMcpFetch },
    );
  });

  it("search_routines over bearer auth returns owner published routines only", async () => {
    const storage = await openMigratedDatabase();
    const owner = testOpaqueEntityId("didi-1023-bearer-search");
    await seedPractitioner(storage, owner, "bearer-search@example.com");
    await seedOwnerPublishedRoutine(storage, owner, {
      name: "Bearer knee starter",
      seed: "bearer-search",
    });
    await ensureMcpBearerSchema(storage);
    const bearerDeps = await createProductionStyleMcpDeps(storage);
    const bearerToken = await seedBearerMcpAccessToken(
      bearerDeps,
      owner,
      "bearer-search@example.com",
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
        const result = await client.callTool({
          name: SEARCH_ROUTINES_TOOL_NAME,
          arguments: { query: "knee" },
        });
        expect(result.isError).not.toBe(true);
        const body = result.structuredContent as {
          routines?: { routine_name: string }[];
        };
        expect(body.routines?.length).toBe(1);
        expect(body.routines![0]?.routine_name).toBe("Bearer knee starter");
      },
      { baseUrl: MCP_TEST_BASE, fetch: bearerMcpFetch },
    );
  });
});
