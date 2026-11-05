import { describe, expect, it } from "vitest";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import type { ExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import {
  openMigratedDatabase,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";

const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const AFTER_FORM = "2026-10-30T11:00:00.000Z";

describe("Exercise request submit batch (integration)", () => {
  it("submitRequest creates the request and draft through one sql.batch call", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-submit-batch-once"),
        "sbo@example.com",
      );
      let batchCalls = 0;
      let requestInsertRunCalls = 0;
      const tracking: SqlStoragePort = {
        run: async (sql, bindings) => {
          const normalized = sql.trim().replace(/\s+/g, " ");
          if (
            normalized.startsWith("INSERT INTO exercise_requests") &&
            normalized.includes("requested_name")
          ) {
            requestInsertRunCalls += 1;
          }
          return storage.run(sql, bindings);
        },
        all: (sql, bindings) => storage.all(sql, bindings),
        first: (sql, bindings) => storage.first(sql, bindings),
        batch: async (statements) => {
          batchCalls += 1;
          return storage.batch(statements);
        },
      };
      const service = new ExerciseRequestsService(tracking, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Single submit batch",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      expect(batchCalls).toBe(1);
      expect(requestInsertRunCalls).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("rolls back submit when a guarded batch statement fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-submit-batch-fail"),
        "sbf@example.com",
      );
      const failingGenerator = async () => {
        throw new Error("injected drafter failure");
      };
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: failingGenerator,
      });
      await expect(
        service.submitRequest({
          practitionerId: requester,
          requestedName: "Injected failure move",
          formOpenedAt: FORM_OPENED,
        }),
      ).rejects.toThrow("injected drafter failure");
      const countRow = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercise_requests WHERE requested_name = ?",
        ["Injected failure move"],
      );
      expect(countRow?.count).toBe(0);
    } finally {
      storage.close();
    }
  });

  it("rolls back request insert when the submit batch guard fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("pract-submit-batch-guard"),
        "sbg@example.com",
      );
      const breakingGenerator: ExerciseDraftGenerator = async (input, deps) => {
        const exerciseId = id("ex-submit-guard-break");
        const versionId = id("ver-submit-guard-break");
        const statements = [
          deps.requests.buildInsertBatchStatement({
            id: input.requestId,
            requestedName: input.requestedName,
            note: input.exerciseNote,
            requestedBy: input.requestedBy,
            status: "open",
            createdAt: input.now,
            updatedAt: input.now,
          }),
          deps.exercises.buildInsertBatchStatement({
            id: exerciseId,
            category: "stretch",
            created_by: input.requestedBy,
            created_at: input.now,
          }),
          deps.versions.buildInsertMinimalDraftBatchStatement({
            id: versionId,
            exerciseId,
            title: input.requestedName,
            createdAt: input.now,
          }),
          {
            ...deps.requests.buildUpdateAfterDraftLinkBatchStatement({
              id: input.requestId,
              status: "drafting",
              exerciseId,
              updatedAt: input.now,
            }),
            minRowsAffected: 999,
          },
        ];
        await input.sql.batch(statements);
        return { exerciseId, versionId };
      };
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
        draftGenerator: breakingGenerator,
      });
      await expect(
        service.submitRequest({
          practitionerId: requester,
          requestedName: "Guard fail submit",
          formOpenedAt: FORM_OPENED,
        }),
      ).rejects.toMatchObject({ code: "submit_failed" });
      const requestCount = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercise_requests WHERE requested_name = ?",
        ["Guard fail submit"],
      );
      expect(requestCount?.count).toBe(0);
      const exerciseCount = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM exercises WHERE id = ?",
        [id("ex-submit-guard-break")],
      );
      expect(exerciseCount?.count).toBe(0);
    } finally {
      storage.close();
    }
  });
});
