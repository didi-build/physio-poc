import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

function authedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

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

describe("My defaults HTTP routes (integration)", () => {
  it("returns 401 without a session", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        new Request(`http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults`),
        deps,
      );
      expect(response.status).toBe(401);
    } finally {
      storage.close();
    }
  });

  it("reads and updates share link expiry for the signed-in practitioner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const otherId = testOpaqueEntityId("my-defaults-other");
      await seedPractitioner(storage, otherId, "other@example.com");
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const getResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults`,
          cookie,
        ),
        deps,
      );
      expect(getResponse.status).toBe(200);
      const body = (await getResponse.json()) as {
        share_link_expiry: { effective: { expiresIn: string } };
      };
      expect(body.share_link_expiry.effective.expiresIn).toBe(
        SHARE_LINK_EXPIRES_IN.one_year,
      );

      const forbidden = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${otherId}/my-defaults`,
          cookie,
        ),
        deps,
      );
      expect(forbidden.status).toBe(403);

      const patchResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults/share-link-expiry`,
          cookie,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_week }),
          },
        ),
        deps,
      );
      expect(patchResponse.status).toBe(200);
      const patched = (await patchResponse.json()) as {
        effective: { expiresIn: string };
      };
      expect(patched.effective.expiresIn).toBe(SHARE_LINK_EXPIRES_IN.one_week);
    } finally {
      storage.close();
    }
  });

  it("DELETE on a type default resets to global", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const putResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults/types/isometric`,
          cookie,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              params: { reps: 2, hold_s: 15, sets: 4, days_per_week: 5 },
            }),
          },
        ),
        deps,
      );
      expect(putResponse.status).toBe(200);

      const deleteResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults/types/isometric`,
          cookie,
          { method: "DELETE" },
        ),
        deps,
      );
      expect(deleteResponse.status).toBe(200);
      const body = (await deleteResponse.json()) as { practitioner_params: null };
      expect(body.practitioner_params).toBeNull();
    } finally {
      storage.close();
    }
  });
});
