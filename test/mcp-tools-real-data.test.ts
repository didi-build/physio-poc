import { describe, expect, it } from "vitest";
import {
  GET_PROGRAM_BUILDER_LINK_TOOL_NAME,
  GET_PROGRAM_SHARE_LINK_OR_PDF_TOOL_NAME,
  SEARCH_APPROVED_EXERCISES_TOOL_NAME,
  buildWebAppExerciseSearchUrl,
} from "../src/mcp-connector/index.js";
import { handleRequest } from "../src/http/app.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import { ProgramPublishService } from "../src/services/programs/program-publish-service.js";
import {
  ProgramsRepository,
  ProgramRowsRepository,
} from "../src/storage/repositories/programs.js";
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
  withMcpClient,
} from "./mcp-server-test-utils.js";
import { MCP_PATH } from "../src/http/app.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

const BASE = MCP_TEST_BASE;

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

async function migratedMcpDeps(practitionerId: string, email: string) {
  const storage = await openMigratedDatabase();
  await seedPractitioner(storage, practitionerId, email);
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

describe("MCP tools with real data (DIDI-1016)", () => {
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

  it("cross-owner program_code returns Program not found", async () => {
    const ownerA = testOpaqueEntityId("mcp-owner-a");
    const ownerB = testOpaqueEntityId("mcp-owner-b");
    const ownerADeps = await migratedMcpDeps(ownerA, "a@example.com");
    const ownerBDeps = await migratedMcpDeps(ownerB, "b@example.com");
    const programs = new ProgramsRepository(ownerADeps.deps.sql);
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
