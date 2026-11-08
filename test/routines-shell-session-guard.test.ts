import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { fillPhysioAppRoutePattern } from "../src/app-routes.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import type { AppDependencies } from "../src/http/app.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { openMigratedDatabase } from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const BASE = "http://127.0.0.1:8787";

async function unsignedShellDeps(mode: "redirect" | "service-unavailable"): Promise<{
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>;
  deps: AppDependencies;
}> {
  const storage = await openMigratedDatabase();
  return {
    storage,
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth: new FakeAuthPort({ practitioner: null }),
      mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      guardedAppWithoutSession: mode,
    },
  };
}

describe("Routines SPA shell session guard (DIDI-1022)", () => {
  const routineId = id("shell-guard-routine");
  const detailPath = fillPhysioAppRoutePattern("routineDetail", { routineId });
  const myCopyPath = fillPhysioAppRoutePattern("routineMyCopy", { routineId });

  it.each([
    { path: detailPath, label: "detail" },
    { path: myCopyPath, label: "my-copy" },
  ] as const)(
    "unsigned GET $label redirects through sign-in with returnTo (node shell)",
    async ({ path }) => {
      const { storage, deps } = await unsignedShellDeps("redirect");
      try {
        const response = await handleRequest(new Request(`${BASE}${path}`), deps);
        expect(response.status).toBe(302);
        const location = response.headers.get("location") ?? "";
        expect(location).toContain("/sign-in");
        expect(location).toContain(encodeURIComponent(path));
      } finally {
        storage.close();
      }
    },
  );

  it.each([
    { path: detailPath, label: "detail" },
    { path: myCopyPath, label: "my-copy" },
  ] as const)(
    "unsigned GET $label returns 503 when guardedAppWithoutSession is service-unavailable",
    async ({ path }) => {
      const { storage, deps } = await unsignedShellDeps("service-unavailable");
      try {
        const response = await handleRequest(new Request(`${BASE}${path}`), deps);
        expect(response.status).toBe(503);
        expect(await response.text()).toBe("");
      } finally {
        storage.close();
      }
    },
  );
});
