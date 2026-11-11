import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { createPhysioServerConfig } from "../src/http/config.js";
import { handleRoutinesRequest } from "../src/http/routes/routines.js";
import { ROUTINES_SIMILAR_PATH } from "../src/routine-library-api-paths.js";
import {
  DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
  DEFAULT_ROUTINE_SIMILAR_THRESHOLD,
} from "../src/routine-similarity-config.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  ConditionsRepository,
  RoutineConditionsRepository,
  RoutineVersionRowsRepository,
  RoutinesRepository,
  RoutineVersionsRepository,
} from "../src/storage/repositories/routines.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { seedTwoPractitioners } from "./helpers/from-routine-http-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import {
  assertTableCountsUnchanged,
  snapshotTableCounts,
} from "./helpers/routine-similar-table-counts.js";
const BASE = "https://physio.test.example";
const BODY_REGION_KNEE = "br-knee";

const EX_B = id("ex-b");
const VER_B = id("ver-b");
const EX_C = id("ex-c");
const VER_C = id("ver-c");

async function seedExtraApprovedExercises(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<void> {
  for (const [exerciseId, versionId, title] of [
    [EX_B, VER_B, "Quad set"],
    [EX_C, VER_C, "Hamstring curl"],
  ] as const) {
    await seedExercise(storage, practitionerId, exerciseId);
    await storage.run(
      VERSION_INSERT_SQL,
      versionInsertBindings({
        id: versionId,
        exercise_id: exerciseId,
        status: "approved",
        approved_by: practitionerId,
        approved_at: TS,
        title,
      }),
    );
  }
}

async function createRoutineWithExercises(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  authorId: string,
  seeds: {
    routine: string;
    draftVersion: string;
    rowIds: string[];
    exerciseIds: string[];
    versionIds: string[];
    name: string;
    publish: boolean;
  },
): Promise<string> {
  const routines = new RoutinesRepository(storage);
  const rows = new RoutineVersionRowsRepository(storage);
  const versions = new RoutineVersionsRepository(storage);
  const routineId = id(seeds.routine);
  await routines.createDraft({
    id: routineId,
    draftVersionId: id(seeds.draftVersion),
    createdBy: authorId,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
  });
  for (let i = 0; i < seeds.exerciseIds.length; i++) {
    await rows.replaceDraftRow({
      id: id(seeds.rowIds[i]!),
      routineId,
      authorId,
      position: i,
      exerciseId: seeds.exerciseIds[i]!,
      exerciseVersionId: seeds.versionIds[i]!,
      prescriptionType: "stretching",
      params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
      draftUpdatedAt: TS,
    });
  }
  if (seeds.publish) {
    await versions.publishDraft({
      routineId,
      authorId,
      publishedAt: TS,
      name: seeds.name,
    });
  }
  return routineId;
}

function testConfig(threshold?: number) {
  return createPhysioServerConfig({
    webAppBaseUrl: MCP_TEST_CONFIG.webAppBaseUrl,
    auth: MCP_TEST_CONFIG.auth,
    routineSimilarity: threshold === undefined ? {} : { threshold },
  });
}

function appDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  threshold?: number,
) {
  const config = testConfig(threshold);
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId,
      email,
      displayName: "Tester",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, config),
    },
    cookie: auth.createSessionCookieHeader(),
    config,
  };
}

async function postSimilar(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
  body: Record<string, unknown>,
  threshold?: number,
) {
  const { deps, cookie } = appDeps(storage, practitionerId, email, threshold);
  const url = `${BASE}${ROUTINES_SIMILAR_PATH}`;
  const response = await handleRequest(
    new Request(
      url,
      mutatingAppApiRequestInit(url, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    ),
    deps,
  );
  return response;
}

describe("DIDI-1225 routine similar HTTP (integration)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 for unauthenticated handleRequest traffic", async () => {
    const storage = await openMigratedDatabase();
    try {
      const url = `${BASE}${ROUTINES_SIMILAR_PATH}`;
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth: new FakeAuthPort({ practitioner: null }),
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      };
      const response = await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ exercise_ids: [FIXTURE_EXERCISE_ID] }),
          }),
        ),
        deps,
      );
      expect(response.status).toBe(401);
    } finally {
      storage.close();
    }
  });

  it("handleRoutinesRequest rejects null session before scoring", async () => {
    const storage = await openMigratedDatabase();
    try {
      await seedPractitioner(storage, id("similar-direct"), "direct@example.com");
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        auth: new FakeAuthPort({ practitioner: null }),
        mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      };
      const response = await handleRoutinesRequest(
        new Request(`${BASE}${ROUTINES_SIMILAR_PATH}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ exercise_ids: [FIXTURE_EXERCISE_ID] }),
        }),
        deps,
        { sessionPractitioner: null },
      );
      expect(response).not.toBeNull();
      expect(response!.status).toBe(401);
      await expect(response!.json()).resolves.toEqual({ error: "unauthorized" });
    } finally {
      storage.close();
    }
  });

  it("matches identical exercise sets and rejects disjoint sets", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await seedExtraApprovedExercises(storage, practitionerA);
      const publishedId = await createRoutineWithExercises(storage, practitionerA, {
        routine: "pub-match",
        draftVersion: "pub-match-draft",
        rowIds: ["pub-match-r0", "pub-match-r1"],
        exerciseIds: [FIXTURE_EXERCISE_ID, EX_B],
        versionIds: [FIXTURE_VERSION_ID, VER_B],
        name: "Published pair",
        publish: true,
      });

      const identical = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID, EX_B],
      });
      expect(identical.status).toBe(200);
      const identicalBody = (await identical.json()) as {
        matches: { routine_id: string; score: number }[];
      };
      expect(identicalBody.matches.map((m) => m.routine_id)).toContain(publishedId);
      expect(identicalBody.matches[0]!.score).toBe(1);

      const disjoint = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [EX_C],
      });
      const disjointBody = (await disjoint.json()) as { matches: unknown[] };
      expect(disjointBody.matches).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("honours threshold edges and a non-default threshold", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await seedExtraApprovedExercises(storage, practitionerA);
      await createRoutineWithExercises(storage, practitionerA, {
        routine: "pub-thresh-edge",
        draftVersion: "pub-thresh-edge-draft",
        rowIds: ["pub-thresh-edge-r0", "pub-thresh-edge-r1"],
        exerciseIds: [FIXTURE_EXERCISE_ID, EX_B],
        versionIds: [FIXTURE_VERSION_ID, VER_B],
        name: "Threshold half",
        publish: true,
      });

      const atThreshold = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID],
      });
      const atBody = (await atThreshold.json()) as {
        matches: { exercise_jaccard: number }[];
      };
      expect(atBody.matches).toHaveLength(1);
      expect(atBody.matches[0]!.exercise_jaccard).toBe(0.5);

      const aboveThreshold = await postSimilar(
        storage,
        practitionerA,
        "a@example.com",
        { exercise_ids: [FIXTURE_EXERCISE_ID] },
        0.51,
      );
      const aboveBody = (await aboveThreshold.json()) as { matches: unknown[] };
      expect(aboveBody.matches).toEqual([]);

      await createRoutineWithExercises(storage, practitionerA, {
        routine: "pub-thresh",
        draftVersion: "pub-thresh-draft",
        rowIds: ["pub-thresh-r0", "pub-thresh-r1", "pub-thresh-r2"],
        exerciseIds: [FIXTURE_EXERCISE_ID, EX_B, EX_C],
        versionIds: [FIXTURE_VERSION_ID, VER_B, VER_C],
        name: "Threshold ref",
        publish: true,
      });

      const below = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [EX_C],
      });
      const belowBody = (await below.json()) as { matches: unknown[] };
      expect(belowBody.matches).toEqual([]);

      const customThreshold = 0.33;
      const withCustom = await postSimilar(
        storage,
        practitionerA,
        "a@example.com",
        {
          exercise_ids: [EX_B],
          exclude_routine_id: id("pub-thresh-edge"),
        },
        customThreshold,
      );
      const customBody = (await withCustom.json()) as {
        threshold: number;
        matches: { exercise_jaccard: number }[];
      };
      expect(customBody.threshold).toBe(customThreshold);
      expect(customBody.matches).toHaveLength(1);
      expect(customBody.matches[0]!.exercise_jaccard).toBeCloseTo(1 / 3, 5);
    } finally {
      storage.close();
    }
  });

  it("adds the documented condition bonus to the score", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const condRepo = new ConditionsRepository(storage);
      const condId = id("cond-low-back");
      await condRepo.insert({ id: condId, label: "Low back pain" });
      const publishedId = await createRoutineWithExercises(storage, practitionerA, {
        routine: "pub-cond",
        draftVersion: "pub-cond-draft",
        rowIds: ["pub-cond-r0"],
        exerciseIds: [FIXTURE_EXERCISE_ID],
        versionIds: [FIXTURE_VERSION_ID],
        name: "Condition ref",
        publish: true,
      });
      await new RoutineConditionsRepository(storage).link(publishedId, condId);

      const without = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID],
        condition_ids: [],
      });
      const withoutBody = (await without.json()) as {
        matches: { score: number; condition_match: boolean }[];
      };
      expect(withoutBody.matches[0]?.score).toBe(1);
      expect(withoutBody.matches[0]?.condition_match).toBe(false);

      const withCond = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID],
        condition_ids: [condId],
      });
      const withBody = (await withCond.json()) as {
        condition_match_bonus: number;
        matches: {
          score: number;
          condition_match: boolean;
          shared_condition_ids: string[];
        }[];
      };
      expect(withBody.condition_match_bonus).toBe(
        DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
      );
      expect(withBody.matches[0]?.condition_match).toBe(true);
      expect(withBody.matches[0]?.shared_condition_ids).toEqual([condId]);
      expect(withBody.matches[0]?.score).toBe(
        1 + DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
      );
    } finally {
      storage.close();
    }
  });

  it("includes another practitioner published community routine when exercises match", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const bPublished = await createRoutineWithExercises(storage, practitionerB, {
        routine: "b-pub-visible",
        draftVersion: "b-pub-visible-draft",
        rowIds: ["b-pub-visible-r0"],
        exerciseIds: [FIXTURE_EXERCISE_ID],
        versionIds: [FIXTURE_VERSION_ID],
        name: "B community",
        publish: true,
      });
      const response = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID],
      });
      const body = (await response.json()) as { matches: { routine_id: string }[] };
      expect(body.matches.map((m) => m.routine_id)).toContain(bPublished);
    } finally {
      storage.close();
    }
  });

  it("never returns another practitioner private draft even when it would score highest", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      await seedExtraApprovedExercises(storage, practitionerA);
      await createRoutineWithExercises(storage, practitionerB, {
        routine: "b-private",
        draftVersion: "b-private-draft",
        rowIds: ["b-private-r0", "b-private-r1"],
        exerciseIds: [FIXTURE_EXERCISE_ID, EX_B],
        versionIds: [FIXTURE_VERSION_ID, VER_B],
        name: "B secret twin",
        publish: false,
      });

      const response = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID, EX_B],
      });
      const body = (await response.json()) as { matches: { routine_id: string }[] };
      expect(body.matches.map((m) => m.routine_id)).not.toContain(id("b-private"));
      expect(body.matches.length).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("performs no writes across tables", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await createRoutineWithExercises(storage, practitionerA, {
        routine: "pub-nowrite",
        draftVersion: "pub-nowrite-draft",
        rowIds: ["pub-nowrite-r0"],
        exerciseIds: [FIXTURE_EXERCISE_ID],
        versionIds: [FIXTURE_VERSION_ID],
        name: "No write ref",
        publish: true,
      });
      const before = await snapshotTableCounts(storage);
      const writeSpy = vi.spyOn(storage, "run");
      const batchSpy = vi.spyOn(storage, "batch");

      await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID],
      });

      expect(writeSpy).not.toHaveBeenCalled();
      expect(batchSpy).not.toHaveBeenCalled();
      const after = await snapshotTableCounts(storage);
      assertTableCountsUnchanged(before, after);
    } finally {
      storage.close();
    }
  });

  it("does not call fetch while AI similarity is disabled", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      await createRoutineWithExercises(storage, practitionerA, {
        routine: "pub-nofetch",
        draftVersion: "pub-nofetch-draft",
        rowIds: ["pub-nofetch-r0"],
        exerciseIds: [FIXTURE_EXERCISE_ID],
        versionIds: [FIXTURE_VERSION_ID],
        name: "Fetch guard",
        publish: true,
      });
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const config = createPhysioServerConfig({
        webAppBaseUrl: MCP_TEST_CONFIG.webAppBaseUrl,
        auth: MCP_TEST_CONFIG.auth,
        routineSimilarityEnv: {
          PHYSIO_ROUTINE_SIMILAR_AI_ENABLED: "false",
        },
      });
      expect(config.routineSimilarity.aiSimilarityEnabled).toBe(false);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: practitionerA,
          email: "a@example.com",
          displayName: "A",
        },
      });
      const deps = {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config,
        auth,
        mcp: createTestPhysioMcpHttpHandler(storage, config),
      };
      const url = `${BASE}${ROUTINES_SIMILAR_PATH}`;
      const cookie = auth.createSessionCookieHeader();
      await handleRequest(
        new Request(
          url,
          mutatingAppApiRequestInit(url, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ exercise_ids: [FIXTURE_EXERCISE_ID] }),
          }),
        ),
        deps,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      storage.close();
    }
  });

  it("exposes default threshold in successful responses", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const response = await postSimilar(storage, practitionerA, "a@example.com", {
        exercise_ids: [FIXTURE_EXERCISE_ID],
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { threshold: number };
      expect(body.threshold).toBe(DEFAULT_ROUTINE_SIMILAR_THRESHOLD);
    } finally {
      storage.close();
    }
  });
});
