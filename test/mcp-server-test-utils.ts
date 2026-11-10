import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest, MCP_PATH, type AppDependencies } from "../src/http/app.js";
import { resolveTestPhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";

export const MCP_TEST_CONFIG = resolveTestPhysioServerConfig(
  PHYSIO_TEST_BETTER_AUTH_SECRET,
  {
    fakeGoogleProvider: false,
  },
);

export const MCP_TEST_BASE = "https://physio-mcp.test.example";

const MCP_TEST_PRACTITIONER = {
  practitionerId: testOpaqueEntityId("mcp-test-practitioner"),
  email: "mcp.test@example.com",
  displayName: "Kojo",
} as const;

let migratedMcpTestDepsPromise: Promise<AppDependencies> | null = null;

export function createTestPhysioMcpHttpHandler(
  sql: SqlStoragePort,
  config = MCP_TEST_CONFIG,
): ReturnType<typeof createPhysioMcpHttpHandler> {
  return createPhysioMcpHttpHandler({ config, sql });
}

export function createTestAppDependencies(config = MCP_TEST_CONFIG): AppDependencies {
  const sql = new InMemorySqlStorage();
  return {
    sql,
    objects: new InMemoryObjectStorage(),
    config,
    auth: new FakeAuthPort({ practitioner: MCP_TEST_PRACTITIONER }),
    mcp: createTestPhysioMcpHttpHandler(sql, config),
  };
}

export async function createMigratedMcpTestAppDependencies(
  config = MCP_TEST_CONFIG,
): Promise<AppDependencies> {
  const storage = await openMigratedDatabase();
  await seedPractitioner(
    storage,
    MCP_TEST_PRACTITIONER.practitionerId,
    MCP_TEST_PRACTITIONER.email,
  );
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config,
    auth: new FakeAuthPort({ practitioner: MCP_TEST_PRACTITIONER }),
    mcp: createTestPhysioMcpHttpHandler(storage, config),
  };
}

async function ensureMigratedMcpTestDeps(
  config = MCP_TEST_CONFIG,
): Promise<AppDependencies> {
  if (!migratedMcpTestDepsPromise) {
    migratedMcpTestDepsPromise = createMigratedMcpTestAppDependencies(config);
  }
  return migratedMcpTestDepsPromise;
}

export function createHandleRequestFetch(config = MCP_TEST_CONFIG): FetchLike {
  const depsPromise = ensureMigratedMcpTestDeps(config);
  let sessionCookie: string | null = null;
  return async (input, init) => {
    const deps = await depsPromise;
    if (!sessionCookie) {
      sessionCookie = (deps.auth as FakeAuthPort).createSessionCookieHeader();
    }
    const parsed = new URL(input instanceof URL ? input.href : input);
    const localUrl = `${MCP_TEST_BASE}${parsed.pathname}${parsed.search}`;
    const headers = new Headers(init?.headers);
    headers.set("cookie", sessionCookie);
    const request = new Request(localUrl, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body ?? undefined,
    });
    return handleRequest(request, deps);
  };
}

export async function withMcpClient<T>(
  run: (client: Client) => Promise<T>,
  options?: { fetch?: FetchLike; baseUrl?: string },
): Promise<T> {
  const baseUrl = options?.baseUrl ?? MCP_TEST_BASE;
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}${MCP_PATH}`),
    {
      fetch: options?.fetch ?? createHandleRequestFetch(),
    },
  );
  const client = new Client({ name: "physio-mcp-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

export function toolErrorText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }
  const record = result as { content?: unknown };
  const firstContent = Array.isArray(record.content) ? record.content[0] : undefined;
  if (
    firstContent &&
    typeof firstContent === "object" &&
    "text" in firstContent &&
    typeof firstContent.text === "string"
  ) {
    return firstContent.text;
  }
  return "";
}
