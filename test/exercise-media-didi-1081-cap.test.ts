import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/http/app.js";
import type { AppDependencies } from "../src/http/app.js";
import type { ImageGenerationPort } from "../src/storage/ports/image-generation.js";
import {
  DAILY_MEDIA_REGENERATION_CAP,
  ExerciseMediaService,
} from "../src/services/exercise-media/exercise-media-service.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { FailingPutMediaStorage } from "./helpers/failing-put-media-storage.js";
import {
  exerciseMediaSessionCookie,
  exerciseMediaTestDeps,
} from "./helpers/exercise-media-http.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import { id } from "./helpers/opaque-test-ids.js";

const DAILY_LIMIT_MESSAGE = "Daily media regeneration limit reached";
const DAILY_LIMIT_CODE = "daily_limit_reached";
const VERSION_NOT_FOUND_BODY = {
  error: "version_not_found",
  message: "Exercise version not found",
} as const;

class ThrowingGetImageMediaStorage extends PrefixMediaStorage {
  constructor(objects: InMemoryObjectStorage) {
    super(objects);
  }

  override async getImage(): Promise<never> {
    throw new Error("simulated getImage failure");
  }
}

async function seedDraftVersionWithMedia(storage: SqlStoragePort, versionId: string) {
  const practitionerId = await seedPractitioner(storage);
  const exerciseId = await seedExercise(storage, practitionerId);
  await storage.run(
    `INSERT INTO exercise_versions (
      id, exercise_id, version_number, status, approved_by, approved_at,
      title, description, equipment, starting_position, ending_position, steps,
      common_mistakes, regressions, progressions, precautions,
      cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
      media_set_id, change_summary, created_at
    ) VALUES (${Array(23).fill("?").join(", ")})`,
    versionInsertBindings({
      id: versionId,
      exercise_id: exerciseId,
      status: "draft",
      title: "Heel slide",
      starting_position: "Supine",
    }),
  );
  return { practitionerId, exerciseId, versionId };
}

async function insertRegenerationRows(
  storage: SqlStoragePort,
  input: {
    practitionerId: string;
    exerciseId: string;
    versionId: string;
    count: number;
    createdAt: string;
    idPrefix: string;
  },
): Promise<void> {
  for (let index = 0; index < input.count; index += 1) {
    await storage.run(
      `INSERT INTO media_regenerations (
        id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id(`${input.idPrefix}-${index}`),
        input.practitionerId,
        input.exerciseId,
        input.versionId,
        "start",
        0,
        input.createdAt,
      ],
    );
  }
}

async function regenRowCount(
  storage: SqlStoragePort,
  practitionerId: string,
): Promise<number> {
  const row = await storage.first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM media_regenerations WHERE practitioner_id = ?`,
    [practitionerId],
  );
  return row?.count ?? 0;
}

async function regenRowCountInUtcWindow(
  storage: SqlStoragePort,
  practitionerId: string,
  utcDayStartIso: string,
  utcDayEndIso: string,
): Promise<number> {
  const row = await storage.first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM media_regenerations
     WHERE practitioner_id = ?
       AND created_at >= ?
       AND created_at < ?`,
    [practitionerId, utcDayStartIso, utcDayEndIso],
  );
  return row?.count ?? 0;
}

function createService(
  storage: SqlStoragePort,
  options: {
    clock?: () => Date;
    createId?: () => string;
    images?: ImageGenerationPort;
    media?: PrefixMediaStorage | ThrowingGetImageMediaStorage | FailingPutMediaStorage;
  } = {},
): ExerciseMediaService {
  return new ExerciseMediaService(
    storage,
    options.images ?? new FakeImageGeneration(),
    options.media ?? new PrefixMediaStorage(new InMemoryObjectStorage()),
    options.clock ?? (() => new Date("2026-10-30T12:00:00.000Z")),
    options.createId,
  );
}

describe("DIDI-1081 daily cap through regenerateMedia", () => {
  it("does not count another practitioner's five same-day rows against this one", async () => {
    const storage = await openMigratedDatabase();
    try {
      const subjectVersionId = id("ver-subject-1081");
      const otherVersionId = id("ver-other-1081");
      const subject = await seedDraftVersionWithMedia(storage, subjectVersionId);
      const otherPractitionerId = await seedPractitioner(
        storage,
        undefined,
        "other@example.com",
      );
      const otherExerciseId = await seedExercise(
        storage,
        otherPractitionerId,
        id("ex-other-1081"),
      );
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, ending_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (${Array(23).fill("?").join(", ")})`,
        versionInsertBindings({
          id: otherVersionId,
          exercise_id: otherExerciseId,
          status: "draft",
          title: "Other",
        }),
      );
      const service = createService(storage);
      await service.generateInitialMediaForVersion({
        practitionerId: subject.practitionerId,
        exerciseVersionId: subjectVersionId,
        countTowardDailyQuota: false,
      });
      await insertRegenerationRows(storage, {
        practitionerId: otherPractitionerId,
        exerciseId: otherExerciseId,
        versionId: otherVersionId,
        count: DAILY_MEDIA_REGENERATION_CAP,
        createdAt: "2026-10-30T12:00:00.000Z",
        idPrefix: "other-cap",
      });
      await expect(
        service.regenerateMedia({
          practitionerId: subject.practitionerId,
          exerciseVersionId: subjectVersionId,
          scope: "start",
        }),
      ).resolves.toMatchObject({ outcome: "draft_updated" });
      expect(
        await regenRowCountInUtcWindow(
          storage,
          subject.practitionerId,
          "2026-10-30T00:00:00.000Z",
          "2026-10-31T00:00:00.000Z",
        ),
      ).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("does not count five rows at the previous UTC day 23:59:59.999Z", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-yesterday-1081");
      const { practitionerId, exerciseId } = await seedDraftVersionWithMedia(
        storage,
        versionId,
      );
      const service = createService(storage, {
        clock: () => new Date("2026-10-30T12:00:00.000Z"),
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      await insertRegenerationRows(storage, {
        practitionerId,
        exerciseId,
        versionId,
        count: DAILY_MEDIA_REGENERATION_CAP,
        createdAt: "2026-10-29T23:59:59.999Z",
        idPrefix: "yesterday-cap",
      });
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).resolves.toMatchObject({ outcome: "draft_updated" });
      expect(
        await regenRowCountInUtcWindow(
          storage,
          practitionerId,
          "2026-10-30T00:00:00.000Z",
          "2026-10-31T00:00:00.000Z",
        ),
      ).toBe(1);
      expect(await regenRowCount(storage, practitionerId)).toBe(6);
    } finally {
      storage.close();
    }
  });

  it("resets the cap at the next UTC day 00:00:00.000Z", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-next-day-1081");
      const { practitionerId, exerciseId } = await seedDraftVersionWithMedia(
        storage,
        versionId,
      );
      const service = createService(storage, {
        clock: () => new Date("2026-10-31T00:00:00.000Z"),
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      await insertRegenerationRows(storage, {
        practitionerId,
        exerciseId,
        versionId,
        count: DAILY_MEDIA_REGENERATION_CAP,
        createdAt: "2026-10-30T23:59:00.000Z",
        idPrefix: "prior-day-full",
      });
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).resolves.toMatchObject({ outcome: "draft_updated" });
      expect(
        await regenRowCountInUtcWindow(
          storage,
          practitionerId,
          "2026-10-31T00:00:00.000Z",
          "2026-11-01T00:00:00.000Z",
        ),
      ).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("does not count a row at the next UTC day 00:00:00.000Z toward the current day's cap", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-next-midnight-1081");
      const { practitionerId, exerciseId } = await seedDraftVersionWithMedia(
        storage,
        versionId,
      );
      const service = createService(storage, {
        clock: () => new Date("2026-10-30T18:00:00.000Z"),
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      await insertRegenerationRows(storage, {
        practitionerId,
        exerciseId,
        versionId,
        count: DAILY_MEDIA_REGENERATION_CAP - 1,
        createdAt: "2026-10-30T10:00:00.000Z",
        idPrefix: "same-day-four",
      });
      await storage.run(
        `INSERT INTO media_regenerations (
          id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id("tomorrow-midnight-row"),
          practitionerId,
          exerciseId,
          versionId,
          "start",
          0,
          "2026-10-31T00:00:00.000Z",
        ],
      );
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).resolves.toMatchObject({ outcome: "draft_updated" });
      expect(
        await regenRowCountInUtcWindow(
          storage,
          practitionerId,
          "2026-10-30T00:00:00.000Z",
          "2026-10-31T00:00:00.000Z",
        ),
      ).toBe(DAILY_MEDIA_REGENERATION_CAP);
    } finally {
      storage.close();
    }
  });

  it("does not count five rows stored entirely on the next UTC calendar day", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-future-day-1081");
      const { practitionerId, exerciseId } = await seedDraftVersionWithMedia(
        storage,
        versionId,
      );
      const service = createService(storage, {
        clock: () => new Date("2026-10-30T12:00:00.000Z"),
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      await insertRegenerationRows(storage, {
        practitionerId,
        exerciseId,
        versionId,
        count: DAILY_MEDIA_REGENERATION_CAP,
        createdAt: "2026-10-31T14:00:00.000Z",
        idPrefix: "tomorrow-only",
      });
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).resolves.toMatchObject({ outcome: "draft_updated" });
      expect(
        await regenRowCountInUtcWindow(
          storage,
          practitionerId,
          "2026-10-30T00:00:00.000Z",
          "2026-10-31T00:00:00.000Z",
        ),
      ).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("does not count five rows from an earlier UTC calendar day toward today", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-two-days-ago-1081");
      const { practitionerId, exerciseId } = await seedDraftVersionWithMedia(
        storage,
        versionId,
      );
      const service = createService(storage, {
        clock: () => new Date("2026-10-30T12:00:00.000Z"),
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      await insertRegenerationRows(storage, {
        practitionerId,
        exerciseId,
        versionId,
        count: DAILY_MEDIA_REGENERATION_CAP,
        createdAt: "2026-10-28T09:00:00.000Z",
        idPrefix: "two-days-ago",
      });
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).resolves.toMatchObject({ outcome: "draft_updated" });
      expect(
        await regenRowCountInUtcWindow(
          storage,
          practitionerId,
          "2026-10-30T00:00:00.000Z",
          "2026-10-31T00:00:00.000Z",
        ),
      ).toBe(1);
      expect(await regenRowCount(storage, practitionerId)).toBe(6);
    } finally {
      storage.close();
    }
  });

  it("counts a row at exactly today's 00:00:00.000Z toward the cap", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-midnight-1081");
      const { practitionerId, exerciseId } = await seedDraftVersionWithMedia(
        storage,
        versionId,
      );
      const service = createService(storage, {
        clock: () => new Date("2026-10-30T15:00:00.000Z"),
      });
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      await storage.run(
        `INSERT INTO media_regenerations (
          id, practitioner_id, exercise_id, exercise_version_id, scope, had_note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id("midnight-row"),
          practitionerId,
          exerciseId,
          versionId,
          "start",
          0,
          "2026-10-30T00:00:00.000Z",
        ],
      );
      await insertRegenerationRows(storage, {
        practitionerId,
        exerciseId,
        versionId,
        count: DAILY_MEDIA_REGENERATION_CAP - 1,
        createdAt: "2026-10-30T14:00:00.000Z",
        idPrefix: "same-day",
      });
      await expect(
        service.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "end",
        }),
      ).rejects.toMatchObject({
        code: DAILY_LIMIT_CODE,
        message: DAILY_LIMIT_MESSAGE,
      });
      expect(await regenRowCount(storage, practitionerId)).toBe(
        DAILY_MEDIA_REGENERATION_CAP,
      );
    } finally {
      storage.close();
    }
  });

  it("refunds the slot when the image provider fails after consume", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-provider-fail-1081");
      const { practitionerId } = await seedDraftVersionWithMedia(storage, versionId);
      const bootstrap = createService(storage);
      await bootstrap.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      const images: ImageGenerationPort = {
        generateStartImage: vi.fn(async () => {
          throw new Error("simulated provider failure after consume");
        }),
        generateEndImage: vi.fn(async () =>
          new FakeImageGeneration().generateEndImage(""),
        ),
        generateStartAndEndImages: vi.fn(async () => {
          throw new Error("simulated provider failure after consume");
        }),
      };
      const regen = createService(storage, { images });
      await expect(
        regen.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).rejects.toThrow("simulated provider failure after consume");
      expect(await regenRowCount(storage, practitionerId)).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("leaves zero rows when getImage fails because the slot is taken only after reads", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-getimage-1081");
      const { practitionerId } = await seedDraftVersionWithMedia(storage, versionId);
      const objects = new InMemoryObjectStorage();
      const bootstrap = createService(storage, {
        media: new PrefixMediaStorage(objects),
      });
      await bootstrap.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
        countTowardDailyQuota: false,
      });
      const regen = createService(storage, {
        media: new ThrowingGetImageMediaStorage(objects),
      });
      await expect(
        regen.regenerateMedia({
          practitionerId,
          exerciseVersionId: versionId,
          scope: "start",
        }),
      ).rejects.toThrow("simulated getImage failure");
      expect(await regenRowCount(storage, practitionerId)).toBe(0);
    } finally {
      storage.close();
    }
  });
});

function mediaRegenRequest(deps: AppDependencies, versionId: string): Request {
  const url = `http://127.0.0.1/api/me/exercise-versions/${versionId}/media/regenerate`;
  const withCsrf = mutatingAppApiRequestInit(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scope: "start" }),
  });
  const headers = new Headers(withCsrf.headers);
  headers.set("cookie", exerciseMediaSessionCookie(deps));
  return new Request(url, { ...withCsrf, headers });
}

describe("DIDI-1081 version not found before cap at HTTP boundary", () => {
  it("returns the same 404 body for unknown and foreign version ids at the daily cap", async () => {
    const storage = await openMigratedDatabase();
    try {
      const subjectVersionId = id("ver-404-subject-1081");
      const foreignVersionId = id("ver-404-foreign-1081");
      const unknownVersionId = id("ver-404-unknown-1081");
      const subject = await seedDraftVersionWithMedia(storage, subjectVersionId);
      const foreignPractitionerId = await seedPractitioner(
        storage,
        undefined,
        "foreign404@example.com",
      );
      const foreignExerciseId = await seedExercise(
        storage,
        foreignPractitionerId,
        id("ex-foreign-404-1081"),
      );
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, ending_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (${Array(23).fill("?").join(", ")})`,
        versionInsertBindings({
          id: foreignVersionId,
          exercise_id: foreignExerciseId,
          status: "draft",
          title: "Foreign",
        }),
      );
      await insertRegenerationRows(storage, {
        practitionerId: subject.practitionerId,
        exerciseId: subject.exerciseId,
        versionId: subjectVersionId,
        count: DAILY_MEDIA_REGENERATION_CAP,
        createdAt: "2026-10-30T12:00:00.000Z",
        idPrefix: "at-cap",
      });
      const deps = exerciseMediaTestDeps(storage, {
        practitionerId: subject.practitionerId,
        email: "coach@example.com",
        displayName: "Coach",
      });
      const foreignResponse = await handleRequest(
        mediaRegenRequest(deps, foreignVersionId),
        deps,
      );
      const unknownResponse = await handleRequest(
        mediaRegenRequest(deps, unknownVersionId),
        deps,
      );
      expect(foreignResponse.status).toBe(404);
      expect(unknownResponse.status).toBe(404);
      await expect(foreignResponse.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
      await expect(unknownResponse.json()).resolves.toEqual(VERSION_NOT_FOUND_BODY);
      expect(await regenRowCount(storage, subject.practitionerId)).toBe(5);
    } finally {
      storage.close();
    }
  });
});

describe("DIDI-1081 daily cap refunds on initial generate", () => {
  it("leaves zero media_regenerations rows when generateInitialMediaForVersion fails after consume", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-initial-refund-1081");
      const { practitionerId } = await seedDraftVersionWithMedia(storage, versionId);
      const images: ImageGenerationPort = {
        generateStartImage: vi.fn(async () => {
          throw new Error("simulated start image failure");
        }),
        generateEndImage: vi.fn(async () =>
          new FakeImageGeneration().generateEndImage(""),
        ),
        generateStartAndEndImages: vi.fn(async () => {
          throw new Error("simulated pair failure");
        }),
      };
      const service = createService(storage, { images });
      await expect(
        service.generateInitialMediaForVersion({
          practitionerId,
          exerciseVersionId: versionId,
          countTowardDailyQuota: true,
        }),
      ).rejects.toThrow("simulated start image failure");
      expect(await regenRowCount(storage, practitionerId)).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("leaves zero media_regenerations rows when counting generateInitialEndImageForVersion fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const versionId = id("ver-end-refund-1081");
      const { practitionerId } = await seedDraftVersionWithMedia(storage, versionId);
      const objects = new InMemoryObjectStorage();
      const bootstrap = createService(storage, {
        media: new PrefixMediaStorage(objects),
      });
      await bootstrap.generateInitialStartImageForVersion({
        practitionerId,
        exerciseVersionId: versionId,
      });
      const endService = createService(storage, {
        media: new FailingPutMediaStorage(objects, 0),
      });
      await expect(
        endService.generateInitialEndImageForVersion({
          practitionerId,
          exerciseVersionId: versionId,
          countTowardDailyQuota: true,
        }),
      ).rejects.toThrow("simulated R2 save failure");
      expect(await regenRowCount(storage, practitionerId)).toBe(0);
    } finally {
      storage.close();
    }
  });
});
