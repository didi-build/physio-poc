import { describe, expect, it } from "vitest";
import { RoutinesLibraryService } from "../src/services/routines/index.js";
import {
  RoutineVersionsRepository,
  PractitionerRoutinesRepository,
} from "../src/storage/repositories/routines.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { publishRoutine } from "./helpers/from-routine-http-fixture.js";
import {
  communityChangeListUnavailable,
  personalChangesUnavailable,
} from "../src/services/routines/routine-personal-change-projection.js";

async function seedMultiVersionRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
) {
  const author = await seedPractitioner(storage);
  await seedApprovedExerciseVersion(storage, author);
  const routineId = id("community-change-list");
  const v1 = await publishRoutine(storage, author, {
    routine: "community-change-list",
    draftVersion: "community-change-list-draft",
    row: "community-change-list-row",
    name: "Community change list base",
  });
  return { author, routineId, v1 };
}

async function flagRoutineWithV2Summary(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  routineId: string,
  v1: { id: string },
  summary: string,
) {
  const versions = new RoutineVersionsRepository(storage);
  const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
  await service.saveToMyRoutines(author, routineId);
  await versions.savePublishedVersion({
    id: id(`cc-v2-${summary.slice(0, 8)}`),
    routineId,
    createdBy: author,
    createdAt: TS,
    name: "v2",
    copyFromVersionId: v1.id,
    changeSummary: summary,
  });
}

describe("Routine community_change_list (DIDI-1183 / DIDI-1022)", () => {
  it("lists newer published versions in order with summaries and version-only gaps", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { author, routineId, v1 } = await seedMultiVersionRoutine(storage);
      const versions = new RoutineVersionsRepository(storage);
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);

      const v2 = await versions.savePublishedVersion({
        id: id("cc-v2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Community change list v2",
        copyFromVersionId: v1.id,
        changeSummary: "Longer hold\nSecond line",
      });
      const v3 = await versions.savePublishedVersion({
        id: id("cc-v3"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Community change list v3",
        copyFromVersionId: v2.id,
      });
      await versions.savePublishedVersion({
        id: id("cc-v4"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Community change list v4",
        copyFromVersionId: v3.id,
        changeSummary: "Added cool-down",
      });

      const details = await service.getRoutineDetails(author, routineId);
      expect(details.community_change_list).toEqual({
        baseline_available: true,
        entries: [
          { version_number: 2, change_summary: "Longer hold\nSecond line" },
          { version_number: 3, change_summary: null },
          { version_number: 4, change_summary: "Added cool-down" },
        ],
      });
      expect(details.personal_changes).toMatchObject({
        baseline_available: true,
        change_count: 0,
        your_change_positions: [],
      });
    } finally {
      storage.close();
    }
  });

  it("excludes a newer unpublished draft row from published-only community list query", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { author, routineId, v1 } = await seedMultiVersionRoutine(storage);
      const versions = new RoutineVersionsRepository(storage);
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      await versions.savePublishedVersion({
        id: id("cc-published-v2-only"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Published v2 only",
        copyFromVersionId: v1.id,
        changeSummary: "Shipped",
      });
      const draftId = id("cc-unpublished-v3-draft");
      await storage.run("PRAGMA ignore_check_constraints = 1");
      await storage.run(
        `INSERT INTO routine_versions (
          id, routine_id, version_number, status, name,
          change_summary, restored_from_version_id, created_by, created_at
        ) VALUES (?, ?, 3, 'draft', 'Unpublished v3 draft', 'Must not list', NULL, ?, ?)`,
        [draftId, routineId, author, TS],
      );
      await storage.run("PRAGMA ignore_check_constraints = 0");

      const queryRows = await versions.listPublishedVersionsAfterBaseline(routineId, 1);
      expect(queryRows.map((row) => row.version_number)).toEqual([2]);
      expect(queryRows.every((row) => row.status === "published")).toBe(true);

      const details = await service.getRoutineDetails(author, routineId);
      expect(details.community_change_list).toEqual({
        baseline_available: true,
        entries: [{ version_number: 2, change_summary: "Shipped" }],
      });
    } finally {
      storage.close();
    }
  });

  it("omits community_change_list when not community_updated", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { author, routineId, v1 } = await seedMultiVersionRoutine(storage);
      const versions = new RoutineVersionsRepository(storage);
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      const saved = await service.saveToMyRoutines(author, routineId);
      const before = await service.getRoutineDetails(author, routineId);
      expect(before.community_change_list).toBeNull();

      await versions.savePublishedVersion({
        id: id("cc-draft-after"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Would-be v2",
        copyFromVersionId: v1.id,
        changeSummary: "Published v2",
      });

      const flagged = await service.getRoutineDetails(author, routineId);
      expect(flagged.community_change_list).toEqual({
        baseline_available: true,
        entries: [{ version_number: 2, change_summary: "Published v2" }],
      });

      await service.applyUndo(author, routineId, saved.undo);
      const removed = await service.getRoutineDetails(author, routineId);
      expect(removed.my_copy).toBeNull();
      expect(removed.community_change_list).toBeNull();
    } finally {
      storage.close();
    }
  });

  it.each([
    {
      label: "foreign-routine baseline version id",
      corrupt: async (
        storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
        author: string,
        _routineId: string,
        copyId: string,
      ) => {
        const other = await publishRoutine(storage, author, {
          routine: "cc-foreign",
          draftVersion: "cc-foreign-draft",
          row: "cc-foreign-row",
          name: "Foreign",
        });
        await storage.run(
          `UPDATE practitioner_routines SET source_routine_version_id = ? WHERE id = ?`,
          [other.id, copyId],
        );
      },
    },
    {
      label: "missing baseline version row",
      corrupt: async (
        storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
        _author: string,
        _routineId: string,
        _copyId: string,
        v1: { id: string },
      ) => {
        await storage.run(
          `DELETE FROM routine_version_rows WHERE routine_version_id = ?`,
          [v1.id],
        );
        await storage.run("PRAGMA foreign_keys = OFF");
        await storage.run(`DELETE FROM routine_versions WHERE id = ?`, [v1.id]);
        await storage.run("PRAGMA foreign_keys = ON");
      },
    },
    {
      label: "unpublished draft baseline",
      corrupt: async (
        storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
        author: string,
        routineId: string,
        copyId: string,
      ) => {
        const draftId = id("cc-draft-baseline");
        await storage.run(
          `INSERT INTO routine_versions (
          id, routine_id, version_number, status, name,
          change_summary, restored_from_version_id, created_by, created_at
        ) VALUES (?, ?, 0, 'draft', 'draft baseline', NULL, NULL, ?, ?)`,
          [draftId, routineId, author, TS],
        );
        await storage.run(
          `UPDATE practitioner_routines SET source_routine_version_id = ? WHERE id = ?`,
          [draftId, copyId],
        );
      },
    },
    {
      label: "source_version_number mismatch",
      corrupt: async (
        storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
        author: string,
        routineId: string,
        copyId: string,
        v1: { id: string },
      ) => {
        const versions = new RoutineVersionsRepository(storage);
        const v2 = await versions.findPublishedVersion(routineId, 2);
        if (!v2) {
          throw new Error("expected v2");
        }
        await versions.savePublishedVersion({
          id: id("cc-mismatch-v3"),
          routineId,
          createdBy: author,
          createdAt: TS,
          name: "v3 for mismatch",
          copyFromVersionId: v2.id,
        });
        void v1;
        await storage.run(
          `UPDATE practitioner_routines SET source_version_number = 2 WHERE id = ?`,
          [copyId],
        );
      },
    },
  ] as const)(
    "community_change_list unavailable when baseline is $label",
    async ({ corrupt }) => {
      const storage = await openMigratedDatabase();
      try {
        const { author, routineId, v1 } = await seedMultiVersionRoutine(storage);
        const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
        await flagRoutineWithV2Summary(
          storage,
          author,
          routineId,
          v1,
          "Should not list",
        );
        const copy = await new PractitionerRoutinesRepository(
          storage,
        ).findForPractitioner(author, routineId);
        await corrupt(storage, author, routineId, copy!.id, v1);

        const details = await service.getRoutineDetails(author, routineId);
        expect(details.personal_changes).toEqual(personalChangesUnavailable());
        expect(details.community_change_list).toEqual(communityChangeListUnavailable());
      } finally {
        storage.close();
      }
    },
  );
});
