import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/entry/worker.js";
import { BetterAuthPort } from "../src/adapters/node/better-auth-port.js";
import { createWorkerProductionAppDependencies } from "../src/adapters/workers/create-worker-production-app-dependencies.js";
import { createNodeAppDependencies } from "../src/adapters/node/create-node-app-dependencies.js";
import { resetWorkerProductionAuthCacheForTests } from "../src/adapters/workers/create-app-dependencies.js";
import { handleRequest } from "../src/http/app.js";
import {
  EXERCISE_MEDIA_REGENERATION_QUOTA_PATH,
  exerciseMediaGeneratePath,
  exerciseMediaRegeneratePath,
  exerciseMediaServePath,
} from "../src/exercise-media-api-paths.js";
import { requiresPractitionerSession } from "../src/auth/public-routes.js";
import { isFakeGoogleOAuthPath } from "../src/auth/fake-google-http.js";
import {
  buildWorkerProductionAuthEnv,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import { openWorkerAuthTestDatabase } from "./helpers/worker-auth-d1-fixture.js";
import { createFakeR2Bucket } from "./helpers/fake-r2-bucket.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

const UNAUTHORIZED_BODY = { error: "unauthorized" } as const;
const FIXTURE_VERSION_ID = testOpaqueEntityId("em-session-guard-ver");

type NullSessionCase = {
  id: string;
  method: string;
  path: string;
  body?: string;
};

/** Matches S01 mutant in didi-1212 evidence script. */
function s01ExtraSessionPublicPath(pathname: string): boolean {
  return pathname === "/api/me/media-regeneration-quota";
}

/** Matches S02 mutant in didi-1212 evidence script. */
function s02ExtraSessionPublicPath(pathname: string): boolean {
  return (
    pathname === "/api/me/media-regeneration-quota" ||
    (pathname.startsWith("/api/me/exercise-versions/") &&
      (pathname.endsWith("/media/generate") ||
        pathname.endsWith("/media/regenerate") ||
        pathname.includes("/media?")))
  );
}

const NULL_SESSION_CASES: NullSessionCase[] = [
  { id: "quota", method: "GET", path: EXERCISE_MEDIA_REGENERATION_QUOTA_PATH },
  {
    id: "generate",
    method: "POST",
    path: exerciseMediaGeneratePath(FIXTURE_VERSION_ID),
    body: "{}",
  },
  {
    id: "regenerate",
    method: "POST",
    path: exerciseMediaRegeneratePath(FIXTURE_VERSION_ID),
    body: JSON.stringify({ scope: "both", note: null }),
  },
  {
    id: "internal-serve-including-pending",
    method: "GET",
    path: `${exerciseMediaServePath(FIXTURE_VERSION_ID)}?access=internal`,
  },
];

afterEach(() => {
  resetWorkerProductionAuthCacheForTests();
  vi.restoreAllMocks();
});

function buildRequest(base: string, routeCase: NullSessionCase): Request {
  const url = `${base}${routeCase.path}`;
  if (routeCase.method === "POST") {
    const init = mutatingAppApiRequestInit(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: routeCase.body,
    });
    return new Request(url, init);
  }
  return new Request(url, { method: routeCase.method });
}

describe("Exercise media session guard (DIDI-1212 S01/S02)", () => {
  it("requiresPractitionerSession stays true for exercise media when S01 extraSessionPublicPath is set", () => {
    for (const routeCase of NULL_SESSION_CASES.filter((c) =>
      c.path.startsWith("/api/me/"),
    )) {
      const pathname = new URL(`https://example.test${routeCase.path}`).pathname;
      expect(
        requiresPractitionerSession(pathname, routeCase.method, {
          extraSessionPublicPath: s01ExtraSessionPublicPath,
        }),
        routeCase.id,
      ).toBe(true);
    }
  });

  it("requiresPractitionerSession stays true for exercise media when S02 extraSessionPublicPath is set", () => {
    for (const routeCase of NULL_SESSION_CASES) {
      const pathname = new URL(`https://example.test${routeCase.path}`).pathname;
      expect(
        requiresPractitionerSession(pathname, routeCase.method, {
          extraSessionPublicPath: s02ExtraSessionPublicPath,
        }),
        routeCase.id,
      ).toBe(true);
    }
    const internalPath = new URL(
      `https://example.test${exerciseMediaServePath(FIXTURE_VERSION_ID)}?access=internal`,
    ).pathname;
    expect(
      requiresPractitionerSession(internalPath, "GET", {
        extraSessionPublicPath: s02ExtraSessionPublicPath,
      }),
    ).toBe(true);
  });

  it("production Worker deps do not exempt exercise media paths via extraSessionPublicPath", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const deps = createWorkerProductionAppDependencies(
        buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: createFakeR2Bucket(),
        }),
      );
      expect(deps.extraSessionPublicPath).toBeUndefined();
    } finally {
      storage.close();
    }
  });

  it("resolve session via getPractitioner before exercise media handlers on production deps (handleRequest)", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      const deps = createWorkerProductionAppDependencies(
        buildWorkerProductionAuthEnv({
          PHYSIO_DB: d1,
          PHYSIO_MEDIA: createFakeR2Bucket(),
        }),
      );
      const getPractitioner = vi
        .spyOn(deps.auth, "getPractitioner")
        .mockResolvedValue(null);
      for (const routeCase of NULL_SESSION_CASES) {
        getPractitioner.mockClear();
        const response = await handleRequest(
          buildRequest(WORKER_PRODUCTION_TEST_BASE, routeCase),
          deps,
        );
        expect(response.status, routeCase.id).toBe(401);
        await expect(response.json(), routeCase.id).resolves.toEqual(UNAUTHORIZED_BODY);
        expect(getPractitioner, `${routeCase.id} session guard`).toHaveBeenCalledTimes(
          1,
        );
      }
    } finally {
      storage.close();
    }
  });

  it("resolve session via getPractitioner before exercise media handlers on worker.fetch", async () => {
    const { d1, storage } = await openWorkerAuthTestDatabase();
    try {
      resetWorkerProductionAuthCacheForTests();
      const env = buildWorkerProductionAuthEnv({
        PHYSIO_DB: d1,
        PHYSIO_MEDIA: createFakeR2Bucket(),
      });
      const getPractitioner = vi
        .spyOn(BetterAuthPort.prototype, "getPractitioner")
        .mockResolvedValue(null);
      for (const routeCase of NULL_SESSION_CASES) {
        getPractitioner.mockClear();
        const response = await worker.fetch(
          buildRequest(WORKER_PRODUCTION_TEST_BASE, routeCase),
          env,
        );
        expect(response.status, routeCase.id).toBe(401);
        await expect(response.json(), routeCase.id).resolves.toEqual(UNAUTHORIZED_BODY);
        expect(
          getPractitioner,
          `${routeCase.id} worker.fetch session guard`,
        ).toHaveBeenCalledTimes(1);
      }
    } finally {
      storage.close();
    }
  });

  it("Node app dependencies do not treat exercise media paths as session-public", async () => {
    const sessionGuardOpts = {
      extraSessionPublicPath: isFakeGoogleOAuthPath,
    };
    for (const routeCase of NULL_SESSION_CASES) {
      const url = new URL(`https://127.0.0.1${routeCase.path}`);
      expect(
        requiresPractitionerSession(url.pathname, routeCase.method, sessionGuardOpts),
        routeCase.id,
      ).toBe(true);
    }
  });

  it("createNodeAppDependencies keeps exercise media paths behind the session guard", async () => {
    const deps = await createNodeAppDependencies({
      AUTH_BASE_URL: "https://127.0.0.1:4173",
      BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "coach@example.com",
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "true",
    });
    const sessionGuardOpts = {
      extraSessionPublicPath: deps.extraSessionPublicPath,
    };
    expect(sessionGuardOpts.extraSessionPublicPath).toBeDefined();
    for (const routeCase of NULL_SESSION_CASES) {
      const url = new URL(`https://127.0.0.1${routeCase.path}`);
      expect(
        requiresPractitionerSession(url.pathname, routeCase.method, sessionGuardOpts),
        routeCase.id,
      ).toBe(true);
    }
    const getPractitioner = vi
      .spyOn(deps.auth, "getPractitioner")
      .mockResolvedValue(null);
    deps.extraRouteHandlers = (
      await import("../src/entry/node.js")
    ).nodeExerciseMediaRouteHandlers("test");
    for (const routeCase of NULL_SESSION_CASES) {
      getPractitioner.mockClear();
      const response = await handleRequest(
        buildRequest("https://127.0.0.1", routeCase),
        deps,
      );
      expect(response.status, routeCase.id).toBe(401);
      await expect(response.json(), routeCase.id).resolves.toEqual(UNAUTHORIZED_BODY);
      expect(
        getPractitioner,
        `${routeCase.id} node session guard`,
      ).toHaveBeenCalledTimes(1);
    }
  });
});
