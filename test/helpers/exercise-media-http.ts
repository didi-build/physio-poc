import type { AppDependencies, AppRouteHandler } from "../../src/http/app.js";
import { handleExerciseMediaRequest } from "../../src/http/routes/exercise-media.js";
import { FakeAuthPort } from "../../src/auth/fake-auth-port.js";
import type { PractitionerSession } from "../../src/auth/auth-port.js";
import { createPhysioMcpHttpHandler } from "../../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../../src/storage/adapters/memory/in-memory-object-storage.js";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import { MCP_TEST_CONFIG } from "../mcp-server-test-utils.js";

/** Test harness: exercise media routes (same handler as Node dev/test extraRouteHandlers). */
export function exerciseMediaExtraRouteHandlers(): AppRouteHandler[] {
  return [handleExerciseMediaRequest];
}

export function exerciseMediaTestDeps(
  sql: SqlStoragePort,
  practitioner: PractitionerSession,
  extras: Partial<AppDependencies> = {},
): AppDependencies {
  const auth = new FakeAuthPort({ practitioner });
  return {
    sql,
    objects: new InMemoryObjectStorage(),
    config: MCP_TEST_CONFIG,
    auth,
    mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
    extraRouteHandlers: exerciseMediaExtraRouteHandlers(),
    ...extras,
  };
}

export function exerciseMediaSessionCookie(deps: AppDependencies): string {
  return (deps.auth as FakeAuthPort).createSessionCookieHeader();
}
