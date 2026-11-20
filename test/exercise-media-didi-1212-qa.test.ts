import { describe, expect, it } from "vitest";
import type { ImageGenerationPort } from "../src/storage/ports/image-generation.js";
import { handleRequest } from "../src/http/app.js";
import { EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES } from "../src/http/bounded-json-request-body.js";
import { DAILY_MEDIA_REGENERATION_CAP } from "../src/services/exercise-media/exercise-media-service.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import {
  exerciseMediaSessionCookie,
  exerciseMediaTestDeps,
} from "./helpers/exercise-media-http.js";
import {
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";

const EXERCISE_MEDIA_ALREADY_GENERATED_409_BODY = {
  error: "exercise_media_already_generated",
} as const;

const REQUEST_BODY_TOO_LARGE_413_BODY = {
  error: "request_body_too_large",
} as const;

async function seedDraftVersion(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
) {
  const practitionerId = await seedPractitioner(storage);
  const exerciseId = await seedExercise(storage, practitionerId);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: FIXTURE_VERSION_ID,
      exercise_id: exerciseId,
      status: "draft",
      title: "Heel slide",
      starting_position: "Supine",
    }),
  ]);
  return { practitionerId, versionId: FIXTURE_VERSION_ID };
}

function mediaRequest(
  url: string,
  deps: ReturnType<typeof exerciseMediaTestDeps>,
  init: RequestInit,
) {
  const withCsrf = mutatingAppApiRequestInit(url, init);
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", exerciseMediaSessionCookie(deps));
  return new Request(url, { ...withCsrf, headers });
}

describe("exercise media DIDI-1212 QA (Q1 generate cap, Q2 body size)", () => {
  it("pins the JSON request body cap at 16384 bytes", () => {
    expect(EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES).toBe(16384);
  });

  it("returns 409 with pinned body on second generate with zero upstream calls", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      let upstreamCalls = 0;
      const images: ImageGenerationPort = {
        async generateStartAndEndImages() {
          upstreamCalls += 1;
          return new FakeImageGeneration().generateStartAndEndImages({
            startPrompt: "s",
            endPrompt: "e",
          });
        },
        generateStartImage: (...args) =>
          new FakeImageGeneration().generateStartImage(...args),
        generateEndImage: (...args) =>
          new FakeImageGeneration().generateEndImage(...args),
      };
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { exerciseMediaImages: images },
      );
      const url = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/generate`;
      const first = await handleRequest(
        mediaRequest(url, deps, { method: "POST", body: JSON.stringify({}) }),
        deps,
      );
      expect(first.status).toBe(201);
      expect(upstreamCalls).toBe(1);
      const second = await handleRequest(
        mediaRequest(url, deps, { method: "POST", body: JSON.stringify({}) }),
        deps,
      );
      expect(second.status).toBe(409);
      await expect(second.json()).resolves.toEqual(
        EXERCISE_MEDIA_ALREADY_GENERATED_409_BODY,
      );
      expect(upstreamCalls).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("returns 429 on generate at daily cap with zero upstream calls (Q1f)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      let upstreamCalls = 0;
      const images: ImageGenerationPort = {
        async generateStartAndEndImages() {
          upstreamCalls += 1;
          return new FakeImageGeneration().generateStartAndEndImages({
            startPrompt: "s",
            endPrompt: "e",
          });
        },
        generateStartImage: (...args) =>
          new FakeImageGeneration().generateStartImage(...args),
        generateEndImage: (...args) =>
          new FakeImageGeneration().generateEndImage(...args),
      };
      const deps = exerciseMediaTestDeps(
        storage,
        {
          practitionerId,
          email: "coach@example.com",
          displayName: "Coach",
        },
        { exerciseMediaImages: images },
      );
      const generateUrl = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/generate`;
      const initial = await handleRequest(
        mediaRequest(generateUrl, deps, { method: "POST", body: JSON.stringify({}) }),
        deps,
      );
      expect(initial.status).toBe(201);
      expect(upstreamCalls).toBe(1);
      const regenUrl = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/regenerate`;
      for (let i = 0; i < DAILY_MEDIA_REGENERATION_CAP - 1; i += 1) {
        const response = await handleRequest(
          mediaRequest(regenUrl, deps, {
            method: "POST",
            body: JSON.stringify({ scope: "start" }),
          }),
          deps,
        );
        expect(response.status).toBe(200);
      }
      const upstreamBeforeCap = upstreamCalls;
      const capped = await handleRequest(
        mediaRequest(generateUrl, deps, { method: "POST", body: JSON.stringify({}) }),
        deps,
      );
      expect(capped.status).toBe(429);
      const body = (await capped.json()) as { error?: string };
      expect(body.error).toBe("daily_limit_reached");
      expect(upstreamCalls).toBe(upstreamBeforeCap);
    } finally {
      storage.close();
    }
  });

  it("shares the daily cap between generate and regenerate", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const generateUrl = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/generate`;
      const regenUrl = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/regenerate`;
      const generate = await handleRequest(
        mediaRequest(generateUrl, deps, { method: "POST", body: JSON.stringify({}) }),
        deps,
      );
      expect(generate.status).toBe(201);
      for (let i = 0; i < DAILY_MEDIA_REGENERATION_CAP - 1; i += 1) {
        const response = await handleRequest(
          mediaRequest(regenUrl, deps, {
            method: "POST",
            body: JSON.stringify({ scope: "start" }),
          }),
          deps,
        );
        expect(response.status).toBe(200);
      }
      const capped = await handleRequest(
        mediaRequest(regenUrl, deps, {
          method: "POST",
          body: JSON.stringify({ scope: "end" }),
        }),
        deps,
      );
      expect(capped.status).toBe(429);
      const body = (await capped.json()) as { error?: string };
      expect(body.error).toBe("daily_limit_reached");
    } finally {
      storage.close();
    }
  });

  it("accepts a JSON body exactly at the cap and rejects cap+1 via Content-Length", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const url = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/regenerate`;
      const shell = JSON.stringify({ scope: "start", pad: "" });
      const padLen = EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES - shell.length;
      const atCapBody = JSON.stringify({ scope: "start", pad: "p".repeat(padLen) });
      expect(new TextEncoder().encode(atCapBody).byteLength).toBe(
        EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES,
      );
      const atCap = await handleRequest(
        mediaRequest(url, deps, {
          method: "POST",
          headers: {
            "content-length": String(EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES),
          },
          body: atCapBody,
        }),
        deps,
      );
      expect(atCap.status).toBe(200);

      const overInit = mutatingAppApiRequestInit(url, {
        method: "POST",
        body: "",
      });
      const overHeaders = new Headers(overInit.headers);
      overHeaders.set("cookie", exerciseMediaSessionCookie(deps));
      overHeaders.set(
        "content-length",
        String(EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES + 1),
      );
      const over = await handleRequest(
        new Request(url, { ...overInit, headers: overHeaders }),
        deps,
      );
      expect(over.status).toBe(413);
      await expect(over.json()).resolves.toEqual(REQUEST_BODY_TOO_LARGE_413_BODY);
    } finally {
      storage.close();
    }
  });

  it("rejects oversize body via bounded read when Content-Length is missing or understated", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerId, versionId } = await seedDraftVersion(storage);
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const url = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/generate`;
      const shell = JSON.stringify({ pad: "" });
      const padLen = EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES + 1 - shell.length;
      const oversized = JSON.stringify({ pad: "q".repeat(padLen) });
      expect(new TextEncoder().encode(oversized).byteLength).toBe(
        EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES + 1,
      );
      const understatedInit = mutatingAppApiRequestInit(url, {
        method: "POST",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(oversized));
            controller.close();
          },
        }),
      });
      const understatedHeaders = new Headers(understatedInit.headers);
      understatedHeaders.set("cookie", exerciseMediaSessionCookie(deps));
      understatedHeaders.set("content-length", "1");
      const understated = await handleRequest(
        new Request(url, {
          ...understatedInit,
          headers: understatedHeaders,
          duplex: "half",
        } as RequestInit),
        deps,
      );
      expect(understated.status).toBe(413);
      await expect(understated.json()).resolves.toEqual(
        REQUEST_BODY_TOO_LARGE_413_BODY,
      );

      const missingClInit = mutatingAppApiRequestInit(url, {
        method: "POST",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(oversized));
            controller.close();
          },
        }),
      });
      const missingClHeaders = new Headers(missingClInit.headers);
      missingClHeaders.set("cookie", exerciseMediaSessionCookie(deps));
      const missingCl = await handleRequest(
        new Request(url, {
          ...missingClInit,
          headers: missingClHeaders,
          duplex: "half",
        } as RequestInit),
        deps,
      );
      expect(missingCl.status).toBe(413);
      await expect(missingCl.json()).resolves.toEqual(REQUEST_BODY_TOO_LARGE_413_BODY);
    } finally {
      storage.close();
    }
  });
});
