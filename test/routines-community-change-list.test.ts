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
import { personalChangesUnavailable } from "../src/services/routines/routine-personal-change-projection.js";

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

  it("excludes unpublished drafts and omits list when not community_updated", async () => {
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

  it("keeps personal_changes unavailable when baseline row is missing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { author, routineId, v1 } = await seedMultiVersionRoutine(storage);
      const otherRoutine = await publishRoutine(storage, author, {
        routine: "community-change-other",
        draftVersion: "community-change-other-draft",
        row: "community-change-other-row",
        name: "Other routine",
      });
      const versions = new RoutineVersionsRepository(storage);
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      await versions.savePublishedVersion({
        id: id("cc-baseline-missing-v2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "v2",
        copyFromVersionId: v1.id,
        changeSummary: "Only summary",
      });

      const copy = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(author, routineId);
      await storage.run(
        `UPDATE practitioner_routines SET source_routine_version_id = ? WHERE id = ?`,
        [otherRoutine.id, copy!.id],
      );

      const details = await service.getRoutineDetails(author, routineId);
      expect(details.personal_changes).toEqual(personalChangesUnavailable());
      expect(details.community_change_list).toEqual({
        entries: [{ version_number: 2, change_summary: "Only summary" }],
      });
    } finally {
      storage.close();
    }
  });
});
