import { describe, expect, it } from "vitest";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { FailClosedAuthPort } from "../src/auth/fail-closed-auth-port.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest, MCP_PATH } from "../src/http/app.js";
import worker from "../src/entry/worker.js";

describe("Worker entry fail-closed auth (DIDI-1044 deferral)", () => {
  it("never uses FakeAuthPort even when PHYSIO_USE_FAKE_GOOGLE_PROVIDER=true", async () => {
    const deps = await createWorkerAppDependencies({
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    });
    expect(deps.auth).toBeInstanceOf(FailClosedAuthPort);
    expect(deps.auth).not.toBeInstanceOf(FakeAuthPort);
    expect(deps.enableFakeGoogleRoutes).toBe(false);
  });

  it("does not mount fake Google routes on the Worker entry", async () => {
    const deps = await createWorkerAppDependencies({
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    });
    const response = await handleRequest(
      new Request("https://example.workers.dev/__fake-google/start"),
      deps,
    );
    expect(response.status).toBe(503);
  });

  it("returns 401 for MCP and 503 for guarded app pages without a session", async () => {
    const mcp = await worker.fetch(
      new Request(`https://example.workers.dev${MCP_PATH}`),
      {
        PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      },
    );
    expect(mcp.status).toBe(401);

    const app = await worker.fetch(
      new Request("https://example.workers.dev/programs"),
      {
        PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
      },
    );
    expect(app.status).toBe(503);
    expect(await app.text()).toBe("");
  });

  it("returns 503 for Better Auth API routes", async () => {
    const response = await worker.fetch(
      new Request("https://example.workers.dev/api/auth/sign-in/social", {
        method: "POST",
      }),
      {},
    );
    expect(response.status).toBe(503);
  });
});
