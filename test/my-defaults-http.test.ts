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
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { TypeDefaultsRepository } from "../src/storage/repositories/type-defaults.js";
import { ShareLinkDefaultsRepository } from "../src/storage/repositories/programs.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";

const APP_API_ORIGIN = "http://127.0.0.1";
const CSRF_EVIL_ORIGIN = "https://evil.example.com";

function authedRequest(url: string, cookie: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...init, headers });
}

function authedJsonRequest(path: string, cookie: string, init: RequestInit): Request {
  const url = `${APP_API_ORIGIN}${path}`;
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", cookie);
  return new Request(url, { ...withCsrf, headers });
}

function authedCrossOriginJsonRequest(
  path: string,
  cookie: string,
  init: RequestInit,
  origin: string,
): Request {
  const url = `${APP_API_ORIGIN}${path}`;
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  headers.set("origin", origin);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new Request(url, { ...init, headers });
}

function practitionerIdQuerySuffix(otherPractitionerId: string): string {
  return `?practitionerId=${encodeURIComponent(otherPractitionerId)}`;
}

function practitionerUnderscoreIdQuerySuffix(otherPractitionerId: string): string {
  return `?practitioner_id=${encodeURIComponent(otherPractitionerId)}`;
}

async function expectInvalidInput(response: Response): Promise<void> {
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "invalid_input",
    message: "invalid_input",
  });
}

async function shareLinkPractitionerRowSnapshot(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<{
  id: string;
  expires_in: string;
  custom_expires_on: string | null;
} | null> {
  return storage.first(
    "SELECT id, expires_in, custom_expires_on FROM share_link_defaults WHERE scope = ? AND practitioner_id = ? LIMIT 1",
    ["practitioner", practitionerId],
  );
}

async function assertSessionANeverSeesPractitionerBData(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerA: string,
): Promise<void> {
  const { deps, cookie } = apiDeps(storage, practitionerA);
  const getResponse = await handleRequest(
    authedRequest(`http://127.0.0.1${MY_DEFAULTS_API_BASE}`, cookie),
    deps,
  );
  expect(getResponse.status).toBe(200);
  const page = (await getResponse.json()) as {
    share_link_expiry: {
      practitioner: { expiresIn: string } | null;
      effective: { expiresIn: string };
    };
    exercise_types: Array<{
      type: string;
      practitioner_params: { hold_s?: number } | null;
    }>;
  };
  expect(page.share_link_expiry.practitioner).toBeNull();
  expect(page.share_link_expiry.effective.expiresIn).toBe(
    SHARE_LINK_EXPIRES_IN.one_year,
  );
  const stretching = page.exercise_types.find((row) => row.type === "stretching");
  expect(stretching?.practitioner_params).toBeNull();
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

  it("returns 404 for unknown practitioner my-defaults paths with a session", async () => {
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
        await expect(response.json()).resolves.toEqual({ error: "not_found" });
      }

      const unauthed = await handleRequest(
        new Request(`http://127.0.0.1/api/practitioners/${practitionerId}/my-defaults`),
        deps,
      );
      expect(unauthed.status).toBe(401);
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
        authedJsonRequest(patchPath, cookie, {
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

  it("session A GET does not expose practitioner B share-link override", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-share");
      await seedPractitioner(storage, practitionerB, "b-share@example.com");
      await new ShareLinkDefaultsRepository(storage).upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-share"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.never },
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const getResponse = await handleRequest(
        authedRequest(`http://127.0.0.1${MY_DEFAULTS_API_BASE}`, cookie),
        deps,
      );
      expect(getResponse.status).toBe(200);
      const page = (await getResponse.json()) as {
        share_link_expiry: {
          practitioner: { expiresIn: string } | null;
          effective: { expiresIn: string };
        };
      };
      expect(page.share_link_expiry.practitioner).toBeNull();
      expect(page.share_link_expiry.effective.expiresIn).toBe(
        SHARE_LINK_EXPIRES_IN.one_year,
      );
    } finally {
      storage.close();
    }
  });

  it("session A GET does not expose practitioner B type overrides", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-read");
      await seedPractitioner(storage, practitionerB, "b-read@example.com");
      await new TypeDefaultsRepository(storage).upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-read"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const getResponse = await handleRequest(
        authedRequest(`http://127.0.0.1${MY_DEFAULTS_API_BASE}`, cookie),
        deps,
      );
      expect(getResponse.status).toBe(200);
      const page = (await getResponse.json()) as {
        exercise_types: Array<{
          type: string;
          practitioner_params: { hold_s?: number } | null;
        }>;
      };
      const stretching = page.exercise_types.find((row) => row.type === "stretching");
      expect(stretching?.practitioner_params?.hold_s).not.toBe(99);
      expect(stretching?.practitioner_params).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("session A PATCH to Never updates only A; B share-link row unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-share-never");
      await seedPractitioner(storage, practitionerB, "b-share-never@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-30"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );
      expect(bShareBefore).not.toBeNull();

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const patchResponse = await handleRequest(
        authedJsonRequest(myDefaultsShareLinkExpiryPath(), cookie, {
          method: "PATCH",
          body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.never }),
        }),
        deps,
      );
      expect(patchResponse.status).toBe(200);
      const patched = (await patchResponse.json()) as {
        practitioner: { expiresIn: string } | null;
      };
      expect(patched.practitioner?.expiresIn).toBe(SHARE_LINK_EXPIRES_IN.never);

      const bShareAfter = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );
      expect(bShareAfter).toEqual(bShareBefore);

      const aShareRow = await storage.first<{ expires_in: string }>(
        "SELECT expires_in FROM share_link_defaults WHERE scope = ? AND practitioner_id = ? LIMIT 1",
        ["practitioner", practitionerA],
      );
      expect(aShareRow?.expires_in).toBe(SHARE_LINK_EXPIRES_IN.never);
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId query on GET with invalid_input; B rows unchanged; A never sees B data", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-query-get");
      await seedPractitioner(storage, practitionerB, "b-query-get@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-query-get"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-query-get"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );
      const bStretchingBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const getResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1${MY_DEFAULTS_API_BASE}${practitionerIdQuerySuffix(practitionerB)}`,
          cookie,
        ),
        deps,
      );
      await expectInvalidInput(getResponse);

      expect(await shareLinkPractitionerRowSnapshot(storage, practitionerB)).toEqual(
        bShareBefore,
      );
      const bStretchingAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );
      expect(bStretchingAfter?.params_json).toBe(bStretchingBefore?.params_json);

      await assertSessionANeverSeesPractitionerBData(storage, practitionerA);
    } finally {
      storage.close();
    }
  });

  it("rejects practitioner_id query on GET with invalid_input; B rows unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-query-get-snake");
      await seedPractitioner(storage, practitionerB, "b-query-get-snake@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-query-get-snake"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-query-get-snake"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );
      const bStretchingBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const getResponse = await handleRequest(
        authedRequest(
          `http://127.0.0.1${MY_DEFAULTS_API_BASE}${practitionerUnderscoreIdQuerySuffix(practitionerB)}`,
          cookie,
        ),
        deps,
      );
      await expectInvalidInput(getResponse);

      expect(await shareLinkPractitionerRowSnapshot(storage, practitionerB)).toEqual(
        bShareBefore,
      );
      const bStretchingAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );
      expect(bStretchingAfter?.params_json).toBe(bStretchingBefore?.params_json);
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId query on PATCH with invalid_input; B rows unchanged; A never sees B data", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-query-patch");
      await seedPractitioner(storage, practitionerB, "b-query-patch@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-query-patch"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-query-patch"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );
      const bStretchingBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const patchResponse = await handleRequest(
        authedJsonRequest(
          `${myDefaultsShareLinkExpiryPath()}${practitionerIdQuerySuffix(practitionerB)}`,
          cookie,
          {
            method: "PATCH",
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.never }),
          },
        ),
        deps,
      );
      await expectInvalidInput(patchResponse);

      expect(await shareLinkPractitionerRowSnapshot(storage, practitionerB)).toEqual(
        bShareBefore,
      );
      const bStretchingAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );
      expect(bStretchingAfter?.params_json).toBe(bStretchingBefore?.params_json);

      await assertSessionANeverSeesPractitionerBData(storage, practitionerA);
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId query on PUT with invalid_input; B rows unchanged; A never sees B data", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-query-put");
      await seedPractitioner(storage, practitionerB, "b-query-put@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-query-put"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-query-put"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );
      const bStretchingBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const putResponse = await handleRequest(
        authedJsonRequest(
          `${myDefaultsTypePath("isometric")}${practitionerIdQuerySuffix(practitionerB)}`,
          cookie,
          {
            method: "PUT",
            body: JSON.stringify({
              params: { reps: 5, hold_s: 10, sets: 2, days_per_week: 3 },
            }),
          },
        ),
        deps,
      );
      await expectInvalidInput(putResponse);

      expect(await shareLinkPractitionerRowSnapshot(storage, practitionerB)).toEqual(
        bShareBefore,
      );
      const bStretchingAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );
      expect(bStretchingAfter?.params_json).toBe(bStretchingBefore?.params_json);

      await assertSessionANeverSeesPractitionerBData(storage, practitionerA);
    } finally {
      storage.close();
    }
  });

  it("rejects practitioner_id query on PATCH share-link-expiry with invalid_input; B rows unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-query-patch-snake");
      await seedPractitioner(storage, practitionerB, "b-query-patch-snake@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-query-patch-snake"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-query-patch-snake"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const patchResponse = await handleRequest(
        authedJsonRequest(
          `${myDefaultsShareLinkExpiryPath()}${practitionerUnderscoreIdQuerySuffix(practitionerB)}`,
          cookie,
          {
            method: "PATCH",
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.never }),
          },
        ),
        deps,
      );
      await expectInvalidInput(patchResponse);
      expect(await shareLinkPractitionerRowSnapshot(storage, practitionerB)).toEqual(
        bShareBefore,
      );
    } finally {
      storage.close();
    }
  });

  it("rejects practitioner_id query on PUT type default with invalid_input; B rows unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-query-put-snake");
      await seedPractitioner(storage, practitionerB, "b-query-put-snake@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-b-query-put-snake"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-query-put-snake"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );
      const bStretchingBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const putResponse = await handleRequest(
        authedJsonRequest(
          `${myDefaultsTypePath("isometric")}${practitionerUnderscoreIdQuerySuffix(practitionerB)}`,
          cookie,
          {
            method: "PUT",
            body: JSON.stringify({
              params: { reps: 5, hold_s: 10, sets: 2, days_per_week: 3 },
            }),
          },
        ),
        deps,
      );
      await expectInvalidInput(putResponse);
      expect(await shareLinkPractitionerRowSnapshot(storage, practitionerB)).toEqual(
        bShareBefore,
      );
      const bStretchingAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );
      expect(bStretchingAfter?.params_json).toBe(bStretchingBefore?.params_json);
    } finally {
      storage.close();
    }
  });

  it("rejects practitionerId and practitioner_id query on DELETE type default without changing B rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-query-del");
      await seedPractitioner(storage, practitionerB, "b-query-del@example.com");
      const typeDefaults = new TypeDefaultsRepository(storage);
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-query-del"),
        practitionerB,
        "stretching",
        { hold_s: 99, per_day: 1, days_per_week: 7 },
      );
      const bStretchingBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      for (const querySuffix of [
        practitionerIdQuerySuffix(practitionerB),
        practitionerUnderscoreIdQuerySuffix(practitionerB),
      ]) {
        const deleteResponse = await handleRequest(
          authedJsonRequest(
            `${myDefaultsTypePath("stretching")}${querySuffix}`,
            cookie,
            { method: "DELETE", body: "{}" },
          ),
          deps,
        );
        await expectInvalidInput(deleteResponse);
      }

      const bStretchingAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, "stretching"],
      );
      expect(bStretchingAfter?.params_json).toBe(bStretchingBefore?.params_json);
    } finally {
      storage.close();
    }
  });

  it("rejects nested practitionerId in PATCH share-link-expiry body with invalid_input", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-nested-body-b");
      await seedPractitioner(storage, practitionerB, "b-nested@example.com");
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-nested-body-b"),
        practitionerB,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      const bShareBefore = await shareLinkPractitionerRowSnapshot(
        storage,
        practitionerB,
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const patchResponse = await handleRequest(
        authedJsonRequest(myDefaultsShareLinkExpiryPath(), cookie, {
          method: "PATCH",
          body: JSON.stringify({
            expires_in: SHARE_LINK_EXPIRES_IN.never,
            meta: { practitionerId: practitionerB },
          }),
        }),
        deps,
      );
      await expectInvalidInput(patchResponse);
      expect(await shareLinkPractitionerRowSnapshot(storage, practitionerB)).toEqual(
        bShareBefore,
      );
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
        authedJsonRequest(putPath, cookie, {
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
        authedJsonRequest(path, cookie, {
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
        authedJsonRequest(path, cookie, {
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
        authedJsonRequest(path, cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { reps: 2, hold_s: 15, sets: 4, days_per_week: 5 },
          }),
        }),
        deps,
      );
      expect(putOk.status).toBe(200);

      const deleteRejected = await handleRequest(
        authedJsonRequest(path, cookie, {
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
        authedJsonRequest(myDefaultsShareLinkExpiryPath(), cookie, {
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
        authedJsonRequest(myDefaultsTypePath("stretching"), cookie, {
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
        authedJsonRequest(path, cookie, {
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
        authedJsonRequest(path, cookie, {
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
        authedJsonRequest(myDefaultsTypePath("stretching"), cookie, {
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
        authedJsonRequest(myDefaultsTypePath("isometric"), cookie, {
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

  it("session A reset to global leaves practitioner B type override unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerA = await seedPractitioner(storage);
      const practitionerB = testOpaqueEntityId("my-defaults-b-reset");
      await seedPractitioner(storage, practitionerB, "b-reset@example.com");
      const typeDefaults = new TypeDefaultsRepository(storage);
      const sharedType = "concentric" as const;
      const bParams = { reps: 8, hold_s: 3, sets: 2, days_per_week: 4 };
      const aParams = { reps: 12, hold_s: 2, sets: 3, days_per_week: 3 };
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-b-reset"),
        practitionerB,
        sharedType,
        bParams,
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-a-reset"),
        practitionerA,
        sharedType,
        aParams,
      );

      const { deps, cookie } = apiDeps(storage, practitionerA);
      const deleteResponse = await handleRequest(
        authedJsonRequest(myDefaultsTypePath(sharedType), cookie, {
          method: "DELETE",
          body: "{}",
        }),
        deps,
      );
      expect(deleteResponse.status).toBe(200);

      const bRow = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerB, sharedType],
      );
      expect(JSON.parse(bRow!.params_json)).toEqual(bParams);

      const aRow = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerA, sharedType],
      );
      expect(aRow).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("returns 403 for cross-origin PATCH PUT DELETE on my-defaults and leaves storage unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const typeDefaults = new TypeDefaultsRepository(storage);
      const shareDefaults = new ShareLinkDefaultsRepository(storage);
      await shareDefaults.upsertPractitionerDefault(
        testOpaqueEntityId("sld-csrf-seed"),
        practitionerId,
        { expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days },
      );
      await typeDefaults.upsertPractitionerDefaults(
        testOpaqueEntityId("td-csrf-seed"),
        practitionerId,
        "isometric",
        { reps: 2, hold_s: 15, sets: 4, days_per_week: 5 },
      );

      const shareRowBefore = await storage.first<{
        expires_in: string;
        custom_expires_on: string | null;
      }>(
        "SELECT expires_in, custom_expires_on FROM share_link_defaults WHERE scope = ? AND practitioner_id = ? LIMIT 1",
        ["practitioner", practitionerId],
      );
      const typeRowBefore = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerId, "isometric"],
      );

      const { deps, cookie } = apiDeps(storage, practitionerId);

      const patchResponse = await handleRequest(
        authedCrossOriginJsonRequest(
          myDefaultsShareLinkExpiryPath(),
          cookie,
          {
            method: "PATCH",
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.never }),
          },
          CSRF_EVIL_ORIGIN,
        ),
        deps,
      );
      expect(patchResponse.status).toBe(403);

      const putResponse = await handleRequest(
        authedCrossOriginJsonRequest(
          myDefaultsTypePath("isometric"),
          cookie,
          {
            method: "PUT",
            body: JSON.stringify({
              params: { reps: 9, hold_s: 9, sets: 9, days_per_week: 9 },
            }),
          },
          CSRF_EVIL_ORIGIN,
        ),
        deps,
      );
      expect(putResponse.status).toBe(403);

      const deleteResponse = await handleRequest(
        authedCrossOriginJsonRequest(
          myDefaultsTypePath("isometric"),
          cookie,
          { method: "DELETE", body: "{}" },
          CSRF_EVIL_ORIGIN,
        ),
        deps,
      );
      expect(deleteResponse.status).toBe(403);

      const shareRowAfter = await storage.first<{
        expires_in: string;
        custom_expires_on: string | null;
      }>(
        "SELECT expires_in, custom_expires_on FROM share_link_defaults WHERE scope = ? AND practitioner_id = ? LIMIT 1",
        ["practitioner", practitionerId],
      );
      const typeRowAfter = await storage.first<{ params_json: string }>(
        "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
        ["practitioner", practitionerId, "isometric"],
      );
      expect(shareRowAfter).toEqual(shareRowBefore);
      expect(typeRowAfter?.params_json).toBe(typeRowBefore?.params_json);
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
        authedJsonRequest(path, cookie, {
          method: "PUT",
          body: JSON.stringify({
            params: { reps: 2, hold_s: 15, sets: 4, days_per_week: 5 },
          }),
        }),
        deps,
      );
      expect(putResponse.status).toBe(200);

      const deleteResponse = await handleRequest(
        authedJsonRequest(path, cookie, { method: "DELETE", body: "{}" }),
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
