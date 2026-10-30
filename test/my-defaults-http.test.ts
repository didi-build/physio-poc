import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { handleRequest } from "../src/http/app.js";
import {
  MY_DEFAULTS_API_BASE,
  myDefaultsShareLinkExpiryPath,
  myDefaultsTypePath,
} from "../src/my-defaults-api-paths.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { authedAppApiRequest } from "./helpers/app-api-request.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";

function authedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

function authedMutatingRequest(
  path: string,
  cookie: string,
  init: RequestInit,
): Request {
  return authedAppApiRequest(`http://127.0.0.1${path}`, cookie, init);
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
  it("returns 401 without a session on GET /api/me/my-defaults", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps } = apiDeps(storage, practitionerId);
      const response = await handleRequest(
        new Request(`http://127.0.0.1${MY_DEFAULTS_API_BASE}`),
        deps,
      );
      expect(response.status).toBe(401);
    } finally {
      storage.close();
    }
  });

  it("returns 404 for removed practitioner path routes", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const otherId = testOpaqueEntityId("my-defaults-other");
      await seedPractitioner(storage, otherId, "other@example.com");
      const { deps, cookie } = apiDeps(storage, practitionerId);

      for (const path of [
        `/api/practitioners/${practitionerId}/my-defaults`,
        `/api/practitioners/${otherId}/my-defaults`,
        `/api/practitioners/${otherId}/my-defaults/types/stretching`,
      ]) {
        const response = await handleRequest(
          authedRequest(`http://127.0.0.1${path}`, cookie),
          deps,
        );
        expect(response.status).toBe(404);
      }

      const unauthed = await handleRequest(
        new Request(`http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults`),
        deps,
      );
      expect(unauthed.status).toBe(404);
    } finally {
      storage.close();
    }
  });

  it("reads and updates share link expiry for the signed-in practitioner", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const getResponse = await handleRequest(
        authedRequest(`http://127.0.0.1${MY_DEFAULTS_API_BASE}`, cookie),
        deps,
      );
      expect(getResponse.status).toBe(200);
      const body = (await getResponse.json()) as {
        share_link_expiry: { effective: { expiresIn: string } };
      };
      expect(body.share_link_expiry.effective.expiresIn).toBe(
        SHARE_LINK_EXPIRES_IN.one_year,
      );

      const patchPath = myDefaultsShareLinkExpiryPath();
      const patchResponse = await handleRequest(
        authedMutatingRequest(patchPath, cookie, {
          method: "PATCH",
          body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_week }),
        }),
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

  it("session A cannot mutate practitioner B defaults; B storage unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b");
      await seedPractitioner(storage, practitionerB, "b@example.com");
      const typeDefaults = new TypeDefaultsRepository(storage);
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bRowBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const putPath = myDefaultsTypePath("isometric");
      const putResponse = await handleRequest(
        authedMutatingRequest(putPath, cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { reps: 5, hold_s: 10, sets: 2, days_per_week: 3 },
          }),
        }),
        deps,
      );
      expect(putResponse.status).toBe(200);

      const bRowAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );
      expect(bRowAfter?.params_json).toBe(bRowBefore?.params_json);
      expect(JSON.parse(bRowAfter!.params_json)).toEqual({
        hold_s: 99,
        per_day: 1,
        days_per_week: 7,
      });

      const aRow = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerA, "isometric"],
      );
      expect(aRow).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId in PATCH share-link-expiry body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const path = myDefaultsShareLinkExpiryPath();
      const response = await handleRequest(
        authedMutatingRequest(path, cookie, {
          method: "PATCH",
          body: JSON.stringify({
            expires_in: SHARE_LINK_EXPIRES_IN.one_week,
            practitionerId: testOpaqueEntityId("evil"),
          }),
        }),
        deps,
      );
      expect(response.status).toBe(400);
    } finally {
      storage.close();
    }
  });

  it("rejects practitioner_id in PUT type default body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const path = myDefaultsTypePath("stretching");
      const response = await handleRequest(
        authedMutatingRequest(path, cookie, {
          method: "PUT",
          body: JSON.stringify({
            practitioner_id: practitionerId,
            params: { hold_s: 30, per_day: 2, days_per_week: 4 },
          }),
        }),
        deps,
      );
      expect(response.status).toBe(400);
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId in DELETE type default JSON body", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const path = myDefaultsTypePath("isometric");
      const putOk = await handleRequest(
        authedMutatingRequest(path, cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { reps: 2, hold_s: 15, sets: 4, days_per_week: 5 },
          }),
        }),
        deps,
      );
      expect(putOk.status).toBe(200);

      const deleteRejected = await handleRequest(
        authedMutatingRequest(path, cookie, {
          method: "DELETE",
          body: JSON.stringify({ practitionerId }),
        }),
        deps,
      );
      expect(deleteRejected.status).toBe(400);
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
        authedMutatingRequest(myDefaultsShareLinkExpiryPath(), cookie, {
          method: "PATCH",
          body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.custom_date }),
        }),
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
        authedMutatingRequest(myDefaultsTypePath("stretching"), cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { hold_s: 45, per_day: 2, days_per_week: 4 },
          }),
        }),
        deps,
      );
      expect(putResponse.status).toBe(200);
      const body = (await putResponse.json()) as {
        practitioner_params: {
          hold_s: number;
          per_day: number;
          days_per_week: number;
        };
      };
      expect(body.practitioner_params).toEqual({
        hold_s: 45,
        per_day: 2,
        days_per_week: 4,
      });
      const row = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerId, "stretching"],
      );
      expect(row).not.toBeNull();
      expect(JSON.parse(row!.params_json)).toEqual({
        hold_s: 45,
        per_day: 2,
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
      const path = myDefaultsTypePath("concentric");

      const firstPut = await handleRequest(
        authedMutatingRequest(path, cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: {
              reps: 10,
              hold_s: 2,
              ascent_s: 3,
              sets: 3,
              days_per_week: 3,
            },
          }),
        }),
        deps,
      );
      expect(firstPut.status).toBe(200);

      const secondPut = await handleRequest(
        authedMutatingRequest(path, cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: {
              reps: 11,
              hold_s: 2,
              ascent_s: 3,
              sets: 3,
              days_per_week: 3,
            },
          }),
        }),
        deps,
      );
      expect(secondPut.status).toBe(200);

      const row = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerId, "concentric"],
      );
      expect(JSON.parse(row!.params_json)).toMatchObject({ ascent_s: 3, reps: 11 });

      const getResponse = await handleRequest(
        authedRequest(`http://127.0.0.1${MY_DEFAULTS_API_BASE}`, cookie),
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

  it("PUT on a type default returns 400 for params not allowed for the type", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);

      const putResponse = await handleRequest(
        authedMutatingRequest(myDefaultsTypePath("stretching"), cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { hold_s: 30, per_day: 2, sets: 3, days_per_week: 4 },
          }),
        }),
        deps,
      );
      expect(putResponse.status).toBe(400);
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
        authedMutatingRequest(myDefaultsTypePath("isometric"), cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { reps: 0, hold_s: 10, sets: 3, days_per_week: 3 },
          }),
        }),
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
      const path = myDefaultsTypePath("isometric");

      const putResponse = await handleRequest(
        authedMutatingRequest(path, cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { reps: 2, hold_s: 15, sets: 4, days_per_week: 5 },
          }),
        }),
        deps,
      );
      expect(putResponse.status).toBe(200);

      const deleteResponse = await handleRequest(
        authedMutatingRequest(path, cookie, { method: "DELETE", body: "{}" }),
        deps,
      );
      expect(deleteResponse.status).toBe(200);
      const body = (await deleteResponse.json()) as { practitioner_params: null };
      expect(body.practitioner_params).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("returns 415 for mutating my-defaults requests without JSON content-type", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const path = myDefaultsShareLinkExpiryPath();
      const response = await handleRequest(
        authedRequest(`http://127.0.0.1${path}`, cookie, {
          method: "PATCH",
          headers: {
            origin: "http://127.0.0.1",
            "content-type": "text/plain",
          },
          body: "nope",
        }),
        deps,
      );
      expect(response.status).toBe(415);
    } finally {
      storage.close();
    }
  });
});
