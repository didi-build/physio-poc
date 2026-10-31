import { describe, expect, it } from "vitest";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";
import { handleRequest } from "../src/http/app.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import type { SqlStoragePort } from "../src/storage/ports/sql-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
} from "../src/storage/migrations/apply.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  MIGRATION_0007_SQL,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedExercise,
  seedPractitioner,
} from "./helpers/exercise-sqlite-fixture.js";
import { createFakePhysioD1Database } from "./helpers/fake-physio-d1-database.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";
import { generateOpaqueEntityId } from "../src/domain/opaque-entity-id.js";
import {
  expectSqlBatchGuardTableEmpty,
  snapshotApproveGuardState,
  snapshotExerciseRequestMergeState,
} from "./helpers/exercise-requests-guard-snapshot.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";

const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const BEFORE_FORM = "2026-10-30T09:00:00.000Z";
const AFTER_FORM = "2026-10-30T11:00:00.000Z";
const BASE = "https://physio.test.example";

async function openMigratedD1SqlStorage(): Promise<D1SqlStorage> {
  const d1 = createFakePhysioD1Database();
  const sql = new D1SqlStorage(d1);
  await applyMigration(sql, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(sql, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(sql, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(sql, MIGRATION_0005_ID, MIGRATION_0005_SQL);
  await applyMigration(sql, MIGRATION_0007_ID, MIGRATION_0007_SQL);
  return sql;
}

type StorageCase = {
  label: string;
  open: () => Promise<SqlStoragePort & { close?: () => void }>;
};

const NODE_AND_D1: StorageCase[] = [
  { label: "BetterSqliteStorage", open: () => openMigratedDatabase() },
  { label: "D1SqlStorage fake", open: () => openMigratedD1SqlStorage() },
];

function wrapBatchWithConcurrentWrite(
  inner: SqlStoragePort,
  concurrentWrite: () => Promise<void>,
): SqlStoragePort {
  return {
    run: (sql, bindings) => inner.run(sql, bindings),
    all: (sql, bindings) => inner.all(sql, bindings),
    first: (sql, bindings) => inner.first(sql, bindings),
    batch: async (statements) => {
      await concurrentWrite();
      return inner.batch(statements);
    },
  };
}

async function seedDraftingRequestWithPlaceholder(
  storage: SqlStoragePort,
  requester: string,
  approver: string,
  requestedName: string,
): Promise<{
  requestId: string;
  exerciseId: string;
  versionId: string;
  programRowId: string;
}> {
  const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
    now: () => AFTER_FORM,
  });
  const created = await service.submitRequest({
    practitionerId: requester,
    requestedName,
    formOpenedAt: FORM_OPENED,
  });
  expect(created.outcome).toBe("created");
  if (created.outcome !== "created" || !created.exercise_id) {
    throw new Error("expected created drafting request");
  }
  const version = await storage.first<{ id: string }>(
    `SELECT id FROM exercise_versions WHERE exercise_id = ? AND status = 'draft' LIMIT 1`,
    [created.exercise_id],
  );
  if (!version) {
    throw new Error("expected draft version");
  }
  await seedApprovedExerciseVersion(storage, approver);
  const programBuilder = new ProgramBuilderService(storage);
  const programId = id("prog-qa-guard");
  await programBuilder.createProgram(requester, { programId });
  const programRowId = id("row-qa-guard");
  await programBuilder.addPlaceholderRow(requester, programId, {
    rowId: programRowId,
    exerciseRequestId: created.request_id,
    prescriptionType: "stretching",
    params: { hold_s: 10 },
  });
  return {
    requestId: created.request_id,
    exerciseId: created.exercise_id,
    versionId: version.id,
    programRowId,
  };
}

describe.each(NODE_AND_D1)(
  "Exercise request approve batch guards ($label)",
  ({ open }) => {
    it("approveRequest returns approve_failed with no partial writes when request leaves drafting during the guarded batch (X1, Q11, B4, X2)", async () => {
      const storage = await open();
      try {
        const requester = await seedPractitioner(
          storage,
          id("qa-x1-req"),
          "x1req@example.com",
        );
        const approver = await seedPractitioner(
          storage,
          id("qa-x1-app"),
          "x1app@example.com",
        );
        const seeded = await seedDraftingRequestWithPlaceholder(
          storage,
          requester,
          approver,
          "X1 guard move",
        );
        const racing = wrapBatchWithConcurrentWrite(storage, async () => {
          await storage.run(
            `UPDATE exercise_requests SET status = 'open', updated_at = ? WHERE id = ?`,
            [AFTER_FORM, seeded.requestId],
          );
        });
        const service = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
        });
        await expect(
          service.approveRequest({
            practitionerId: approver,
            requestId: seeded.requestId,
          }),
        ).rejects.toMatchObject({ code: "approve_failed" });
        const after = await snapshotApproveGuardState(
          storage,
          seeded.requestId,
          seeded.versionId,
          seeded.programRowId,
        );
        expect(after.requestStatus).toBe("open");
        expect(after.versionStatus).toBe("draft");
        expect(after.practitionerExerciseCount).toBe(0);
        expect(after.programRowLinkedCount).toBe(0);
        await expectSqlBatchGuardTableEmpty(storage);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("approveRequest returns approve_failed with no partial writes when the draft version is already approved during the guarded batch (Q14, B2)", async () => {
      const storage = await open();
      try {
        const requester = await seedPractitioner(
          storage,
          id("qa-q14-req"),
          "q14req@example.com",
        );
        const approver = await seedPractitioner(
          storage,
          id("qa-q14-app"),
          "q14app@example.com",
        );
        const seeded = await seedDraftingRequestWithPlaceholder(
          storage,
          requester,
          approver,
          "Q14 guard move",
        );
        const racing = wrapBatchWithConcurrentWrite(storage, async () => {
          await storage.run(
            `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
            [approver, AFTER_FORM, seeded.versionId],
          );
        });
        const service = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
        });
        await expect(
          service.approveRequest({
            practitionerId: approver,
            requestId: seeded.requestId,
          }),
        ).rejects.toMatchObject({ code: "approve_failed" });
        const after = await snapshotApproveGuardState(
          storage,
          seeded.requestId,
          seeded.versionId,
          seeded.programRowId,
        );
        expect(after.requestStatus).toBe("drafting");
        expect(after.versionStatus).toBe("approved");
        expect(after.practitionerExerciseCount).toBe(0);
        expect(after.programRowLinkedCount).toBe(0);
        await expectSqlBatchGuardTableEmpty(storage);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("approveRequest returns approve_failed with no partial writes when placeholder link guard fails during the guarded batch", async () => {
      const storage = await open();
      try {
        const requester = await seedPractitioner(
          storage,
          id("qa-link-req"),
          "linkreq@example.com",
        );
        const approver = await seedPractitioner(
          storage,
          id("qa-link-app"),
          "linkapp@example.com",
        );
        const seeded = await seedDraftingRequestWithPlaceholder(
          storage,
          requester,
          approver,
          "Link guard move",
        );
        const racing = wrapBatchWithConcurrentWrite(storage, async () => {
          await storage.run(`DELETE FROM program_rows WHERE id = ?`, [
            seeded.programRowId,
          ]);
        });
        const service = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
        });
        await expect(
          service.approveRequest({
            practitionerId: approver,
            requestId: seeded.requestId,
          }),
        ).rejects.toMatchObject({ code: "approve_failed" });
        const after = await snapshotApproveGuardState(
          storage,
          seeded.requestId,
          seeded.versionId,
        );
        expect(after.requestStatus).toBe("drafting");
        expect(after.versionStatus).toBe("draft");
        expect(after.practitionerExerciseCount).toBe(0);
        const row = await storage.first<{ id: string }>(
          "SELECT id FROM program_rows WHERE id = ?",
          [seeded.programRowId],
        );
        expect(row).toBeNull();
        await expectSqlBatchGuardTableEmpty(storage);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("approveRequest maps SqlBatchGuardError from the guarded batch to approve_failed (X4)", async () => {
      const storage = await open();
      try {
        const requester = await seedPractitioner(
          storage,
          id("qa-x4-req"),
          "x4req@example.com",
        );
        const approver = await seedPractitioner(
          storage,
          id("qa-x4-app"),
          "x4app@example.com",
        );
        const seeded = await seedDraftingRequestWithPlaceholder(
          storage,
          requester,
          approver,
          "X4 mapping move",
        );
        const racing = wrapBatchWithConcurrentWrite(storage, async () => {
          await storage.run(
            `UPDATE exercise_requests SET status = 'open', updated_at = ? WHERE id = ?`,
            [AFTER_FORM, seeded.requestId],
          );
        });
        const service = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
        });
        await expect(
          service.approveRequest({
            practitionerId: approver,
            requestId: seeded.requestId,
          }),
        ).rejects.toMatchObject({ code: "approve_failed" });
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("approveRequest links program placeholders inside the same guarded batch call (B3)", async () => {
      const storage = await open();
      try {
        const requester = await seedPractitioner(
          storage,
          id("qa-b3-req"),
          "b3req@example.com",
        );
        const approver = await seedPractitioner(
          storage,
          id("qa-b3-app"),
          "b3app@example.com",
        );
        const seeded = await seedDraftingRequestWithPlaceholder(
          storage,
          requester,
          approver,
          "B3 batch link move",
        );
        let batchCalls = 0;
        let linkUpdatesInBatch = 0;
        const tracking: SqlStoragePort = {
          run: (sql, bindings) => storage.run(sql, bindings),
          all: (sql, bindings) => storage.all(sql, bindings),
          first: (sql, bindings) => storage.first(sql, bindings),
          batch: async (statements) => {
            batchCalls += 1;
            for (const statement of statements) {
              if (
                statement.sql.includes("UPDATE program_rows") &&
                statement.sql.includes("exercise_version_id")
              ) {
                linkUpdatesInBatch += 1;
              }
            }
            return storage.batch(statements);
          },
        };
        const service = new ExerciseRequestsService(tracking, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
        });
        const approved = await service.approveRequest({
          practitionerId: approver,
          requestId: seeded.requestId,
        });
        expect(batchCalls).toBe(1);
        expect(linkUpdatesInBatch).toBeGreaterThan(0);
        const linked = await storage.first<{ exercise_version_id: string | null }>(
          "SELECT exercise_version_id FROM program_rows WHERE id = ?",
          [seeded.programRowId],
        );
        expect(linked?.exercise_version_id).toBe(approved.exercise_version_id);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });
  },
);

describe("Exercise request updateDraft race guards (BetterSqliteStorage)", () => {
  it("updateDraft does not flip an approved request back to drafting when refresh batch loses its status filter (Q12)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("qa-q12-req"),
        "q12req@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("qa-q12-app"),
        "q12app@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Q12 refresh race",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }
      let refreshBatchSeen = false;
      const racing: SqlStoragePort = {
        run: (sql, bindings) => storage.run(sql, bindings),
        all: (sql, bindings) => storage.all(sql, bindings),
        first: (sql, bindings) => storage.first(sql, bindings),
        batch: async (statements) => {
          const isRefresh = statements.some((statement) =>
            statement.sql.includes("UPDATE exercise_requests SET status"),
          );
          if (isRefresh && !refreshBatchSeen) {
            refreshBatchSeen = true;
            await service.approveRequest({
              practitionerId: approver,
              requestId: created.request_id,
            });
          }
          return storage.batch(statements);
        },
      };
      const patchService = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      await expect(
        patchService.updateDraft({
          practitionerId: approver,
          requestId: created.request_id,
          patch: { title: "Race title" },
        }),
      ).rejects.toMatchObject({ code: "draft_not_ready" });
      const requestRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      expect(requestRow?.status).toBe("approved");
    } finally {
      storage.close();
    }
  });

  it("updateDraft rejects when approve races the refresh batch even if refresh rowsAffected is ignored (X6)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("qa-x6-req"),
        "x6req@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("qa-x6-app"),
        "x6app@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "X6 refresh ignore",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }
      let refreshBatchSeen = false;
      const racing: SqlStoragePort = {
        run: (sql, bindings) => storage.run(sql, bindings),
        all: (sql, bindings) => storage.all(sql, bindings),
        first: (sql, bindings) => storage.first(sql, bindings),
        batch: async (statements) => {
          const isRefresh = statements.some((statement) =>
            statement.sql.includes("UPDATE exercise_requests SET status"),
          );
          if (isRefresh && !refreshBatchSeen) {
            refreshBatchSeen = true;
            await service.approveRequest({
              practitionerId: approver,
              requestId: created.request_id,
            });
          }
          return storage.batch(statements);
        },
      };
      const patchService = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      await expect(
        patchService.updateDraft({
          practitionerId: approver,
          requestId: created.request_id,
          patch: { description: "Race body" },
        }),
      ).rejects.toMatchObject({ code: "draft_not_ready" });
      const requestRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      expect(requestRow?.status).toBe("approved");
    } finally {
      storage.close();
    }
  });

  it("updateDraft rejects when approve races updateDraftFields without a draft status guard on the version row (X7)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("qa-x7-req"),
        "x7req@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("qa-x7-app"),
        "x7app@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "X7 fields race",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created" || !created.exercise_id) {
        return;
      }
      const versionBefore = await storage.first<{ title: string; status: string }>(
        `SELECT title, status FROM exercise_versions WHERE exercise_id = ? AND status = 'draft' LIMIT 1`,
        [created.exercise_id],
      );
      let fieldsUpdateSeen = false;
      const racing: SqlStoragePort = {
        run: async (sql, bindings) => {
          const normalized = sql.replace(/\s+/g, " ");
          if (
            normalized.includes("UPDATE exercise_versions") &&
            normalized.includes("title =") &&
            !fieldsUpdateSeen
          ) {
            fieldsUpdateSeen = true;
            await service.approveRequest({
              practitionerId: approver,
              requestId: created.request_id,
            });
          }
          return storage.run(sql, bindings);
        },
        all: (sql, bindings) => storage.all(sql, bindings),
        first: (sql, bindings) => storage.first(sql, bindings),
        batch: (statements) => storage.batch(statements),
      };
      const patchService = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      await expect(
        patchService.updateDraft({
          practitionerId: approver,
          requestId: created.request_id,
          patch: { title: "Should not stick after race" },
        }),
      ).rejects.toMatchObject({ code: "draft_not_ready" });
      const versionAfter = await storage.first<{ title: string; status: string }>(
        `SELECT title, status FROM exercise_versions WHERE exercise_id = ? ORDER BY version_number DESC LIMIT 1`,
        [created.exercise_id],
      );
      expect(versionAfter?.status).toBe("approved");
      expect(versionAfter?.title).toBe(versionBefore?.title);
    } finally {
      storage.close();
    }
  });

  it("updateDraft rejects when updateDraftFields no longer applies and its result is ignored (X8)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        id("qa-x8-req"),
        "x8req@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        id("qa-x8-app"),
        "x8app@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "X8 fields result",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created" || !created.exercise_id) {
        return;
      }
      let fieldsUpdateSeen = false;
      const racing: SqlStoragePort = {
        run: async (sql, bindings) => {
          const normalized = sql.replace(/\s+/g, " ");
          if (
            normalized.includes("UPDATE exercise_versions") &&
            normalized.includes("description =") &&
            !fieldsUpdateSeen
          ) {
            fieldsUpdateSeen = true;
            await service.approveRequest({
              practitionerId: approver,
              requestId: created.request_id,
            });
          }
          return storage.run(sql, bindings);
        },
        all: (sql, bindings) => storage.all(sql, bindings),
        first: (sql, bindings) => storage.first(sql, bindings),
        batch: (statements) => storage.batch(statements),
      };
      const patchService = new ExerciseRequestsService(racing, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      await expect(
        patchService.updateDraft({
          practitionerId: approver,
          requestId: created.request_id,
          patch: { description: "Ignored patch" },
        }),
      ).rejects.toMatchObject({ code: "draft_not_ready" });
      const requestRow = await storage.first<{ status: string }>(
        "SELECT status FROM exercise_requests WHERE id = ?",
        [created.request_id],
      );
      expect(requestRow?.status).toBe("approved");
    } finally {
      storage.close();
    }
  });
});

describe.each(NODE_AND_D1)(
  "Exercise request merge alias guards ($label)",
  ({ open }) => {
    it("merge returns alias_conflict with zero writes when the alias already exists on another exercise (X13)", async () => {
      const storage = await open();
      try {
        const owner = await seedPractitioner(
          storage,
          id("qa-x13-owner"),
          "x13own@example.com",
        );
        const merger = await seedPractitioner(
          storage,
          id("qa-x13-merge"),
          "x13mer@example.com",
        );
        const otherPract = await seedPractitioner(
          storage,
          id("qa-x13-other"),
          "x13oth@example.com",
        );
        const otherExerciseId = id("ex-x13-other");
        await seedExercise(storage, otherPract, otherExerciseId);
        const takenAlias = "Shared alias name";
        await storage.run(
          `INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)`,
          [generateOpaqueEntityId(), otherExerciseId, takenAlias, AFTER_FORM],
        );

        const ownerService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
        });
        const target = await ownerService.submitRequest({
          practitionerId: owner,
          requestedName: "Target move",
          exerciseNote: "baseline note",
          formOpenedAt: BEFORE_FORM,
        });
        expect(target.outcome).toBe("created");
        if (target.outcome !== "created") {
          return;
        }
        const before = await snapshotExerciseRequestMergeState(
          storage,
          target.request_id,
          target.exercise_id,
        );

        const mergeService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
          now: () => "2026-10-30T12:00:00.000Z",
        });
        await expect(
          mergeService.submitRequest({
            practitionerId: merger,
            requestedName: takenAlias,
            exerciseNote: "should not append",
            formOpenedAt: FORM_OPENED,
            resolution: "merge",
            conflictRequestId: target.request_id,
          }),
        ).rejects.toMatchObject({ code: "alias_conflict" });

        const after = await snapshotExerciseRequestMergeState(
          storage,
          target.request_id,
          target.exercise_id,
        );
        expect(after).toEqual(before);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });

    it("merge returns alias_conflict with zero writes when the alias already exists on the same exercise case-insensitively (X13)", async () => {
      const storage = await open();
      try {
        const owner = await seedPractitioner(
          storage,
          id("qa-x13-same-owner"),
          "x13sown@example.com",
        );
        const merger = await seedPractitioner(
          storage,
          id("qa-x13-same-merge"),
          "x13smer@example.com",
        );
        const ownerService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
          now: () => AFTER_FORM,
        });
        const target = await ownerService.submitRequest({
          practitionerId: owner,
          requestedName: "Primary title",
          formOpenedAt: BEFORE_FORM,
        });
        expect(target.outcome).toBe("created");
        if (target.outcome !== "created" || !target.exercise_id) {
          return;
        }
        await storage.run(
          `INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)`,
          [generateOpaqueEntityId(), target.exercise_id, "Existing Alias", AFTER_FORM],
        );
        const before = await snapshotExerciseRequestMergeState(
          storage,
          target.request_id,
          target.exercise_id,
        );
        const mergeService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
          now: () => "2026-10-30T12:00:00.000Z",
        });
        await expect(
          mergeService.submitRequest({
            practitionerId: merger,
            requestedName: "existing alias",
            exerciseNote: "note must not land",
            formOpenedAt: FORM_OPENED,
            resolution: "merge",
            conflictRequestId: target.request_id,
          }),
        ).rejects.toMatchObject({ code: "alias_conflict" });
        const after = await snapshotExerciseRequestMergeState(
          storage,
          target.request_id,
          target.exercise_id,
        );
        expect(after).toEqual(before);
      } finally {
        if ("close" in storage && typeof storage.close === "function") {
          storage.close();
        }
      }
    });
  },
);

describe("Exercise request merge alias HTTP", () => {
  it("POST submit merge returns 409 alias_conflict without persisting the merged note", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(
        storage,
        id("qa-http-alias-own"),
        "haown@example.com",
      );
      const merger = await seedPractitioner(
        storage,
        id("qa-http-alias-mer"),
        "hamer@example.com",
      );
      const otherPract = await seedPractitioner(
        storage,
        id("qa-http-alias-oth"),
        "haoth@example.com",
      );
      const otherExerciseId = id("ex-http-alias");
      await seedExercise(storage, otherPract, otherExerciseId);
      const takenAlias = "HTTP alias clash";
      await storage.run(
        `INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)`,
        [generateOpaqueEntityId(), otherExerciseId, takenAlias, AFTER_FORM],
      );

      const ownerService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const target = await ownerService.submitRequest({
        practitionerId: owner,
        requestedName: "HTTP merge target",
        exerciseNote: "keep me",
        formOpenedAt: BEFORE_FORM,
      });
      expect(target.outcome).toBe("created");
      if (target.outcome !== "created") {
        return;
      }
      const before = await snapshotExerciseRequestMergeState(
        storage,
        target.request_id,
        target.exercise_id,
      );

      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId: merger,
          email: "hamer@example.com",
          displayName: "Merger",
        },
      });
      const cookie = auth.createSessionCookieHeader();
      const path = "/api/me/exercise-requests";
      const url = `${BASE}${path}`;
      const init = mutatingAppApiRequestInit(url, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          requested_name: takenAlias,
          exercise_note: "must not persist",
          form_opened_at: FORM_OPENED,
          resolution: "merge",
          conflict_request_id: target.request_id,
        }),
      });
      const response = await handleRequest(new Request(url, init), {
        sql: storage,
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
        auth,
      });
      expect(response.status).toBe(409);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("alias_conflict");

      const after = await snapshotExerciseRequestMergeState(
        storage,
        target.request_id,
        target.exercise_id,
      );
      expect(after).toEqual(before);
    } finally {
      storage.close();
    }
  });
});
