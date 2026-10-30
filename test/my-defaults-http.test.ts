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

  it("rejects custom_date for practitioner share link default", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const patchResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults/share-link-expiry`,
          cookie,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.custom_date }),
          },
        ),
        deps,
      );
      expect(patchResponse.status).toBe(400);
    } finally {
      storage.close();
    }
  });

  it("PUT on a type default upserts practitioner params", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const putResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults/types/stretching`,
          cookie,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              params: { hold_s: 45, sets: 2, days_per_week: 4 },
            }),
          },
        ),
        deps,
      );
      expect(putResponse.status).toBe(200);
      const body = (await putResponse.json()) as {
        practitioner_params: { hold_s: number; sets: number; days_per_week: number };
      };
      expect(body.practitioner_params).toEqual({
        hold_s: 45,
        sets: 2,
        days_per_week: 4,
      });
      const row = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerId, "stretching"],
      );
      expect(row).not.toBeNull();
      expect(JSON.parse(row!.params_json)).toEqual({
        hold_s: 45,
        sets: 2,
        days_per_week: 4,
      });
    } finally {
      storage.close();
    }
  });

  it("PUT preserves ascent_s when other params change", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const firstPut = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults/types/concentric`,
          cookie,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              params: {
                reps: 10,
                hold_s: 2,
                ascent_s: 3,
                sets: 3,
                days_per_week: 3,
              },
            }),
          },
        ),
        deps,
      );
      expect(firstPut.status).toBe(200);

      const secondPut = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults/types/concentric`,
          cookie,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              params: {
                reps: 11,
                hold_s: 2,
                ascent_s: 3,
                sets: 3,
                days_per_week: 3,
              },
            }),
          },
        ),
        deps,
      );
      expect(secondPut.status).toBe(200);

      const row = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerId, "concentric"],
      );
      expect(JSON.parse(row!.params_json)).toMatchObject({ ascent_s: 3, reps: 11 });

      const getResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults`,
          cookie,
        ),
        deps,
      );
      expect(getResponse.status).toBe(200);
      const page = (await getResponse.json()) as {
        exercise_types: Array<{
          type: string;
          practitioner_params: { ascent_s?: number } | null;
        }>;
      };
      const concentric = page.exercise_types.find((row) => row.type === "concentric");
      expect(concentric?.practitioner_params?.ascent_s).toBe(3);
    } finally {
      storage.close();
    }
  });

  it("PUT on a type default returns 400 for invalid params", async () => {
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
              params: { reps: 0, hold_s: 10, sets: 3, days_per_week: 3 },
            }),
          },
        ),
        deps,
      );
      expect(putResponse.status).toBe(400);
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
          {
            method: "DELETE",
            headers: { "content-type": "application/json" },
          },
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
