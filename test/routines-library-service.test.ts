import { describe, expect, it } from "vitest";
import { ConditionsRepository } from "../src/storage/repositories/routines.js";
import {
  RoutinesLibraryService,
  RoutinesLibraryServiceError,
} from "../src/services/routines/index.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";

const BODY_REGION_KNEE = "br-knee";

async function publishRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  options: {
    routineId?: string;
    name: string;
    conditionId?: string | null;
    exerciseId: string;
    exerciseVersionId: string;
  },
) {
  const routines = new RoutinesRepository(storage);
  const rows = new RoutineVersionRowsRepository(storage);
  const versions = new RoutineVersionsRepository(storage);
  const routineId = options.routineId ?? id("routine-lib");
  const draftVersionId = id(
    `rv-draft-${options.name.replace(/\s+/g, "-").toLowerCase()}`,
  );
  await routines.createDraft({
    id: routineId,
    draftVersionId,
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
    conditionId: options.conditionId ?? null,
    name: options.name,
  });
  await rows.replaceDraftRow({
    id: id(`rvr-${options.name.replace(/\s+/g, "-").toLowerCase()}`),
    routineId,
    authorId: author,
    position: 0,
    exerciseId: options.exerciseId,
    exerciseVersionId: options.exerciseVersionId,
    prescriptionType: "stretching",
    params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
    draftUpdatedAt: TS,
  });
  const published = await versions.publishDraft({
    routineId,
    authorId: author,
    publishedAt: TS,
    name: options.name,
  });
  return { routineId, published };
}

describe("RoutinesLibraryService (integration, SQLite)", () => {
  it("lists only published routines in community search and skips condition text search when empty", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const other = await seedPractitioner(storage, id("pract-b"), "b@example.com");
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );

      await publishRoutine(storage, author, {
        name: "Knee starter",
        exerciseId,
        exerciseVersionId: versionId,
      });
      await routinesDraftOnly(storage, other);

      const community = await service.searchCommunityRoutines({
        practitionerId: author,
      });
      expect(community.routines).toHaveLength(1);
      expect(community.conditions_available).toBe(false);

      await new ConditionsRepository(storage).insert({
        id: id("cond-arthritis"),
        label: "Arthritis",
      });

      await publishRoutine(storage, author, {
        name: "Arthritis knee",
        conditionId: id("cond-arthritis"),
        routineId: id("routine-cond"),
        exerciseId,
        exerciseVersionId: versionId,
      });

      const withCondition = await service.searchCommunityRoutines({
        practitionerId: author,
        query: "arthritis",
      });
      expect(withCondition.conditions_available).toBe(true);
      expect(withCondition.routines.some((row) => row.name === "Arthritis knee")).toBe(
        true,
      );
    } finally {
      storage.close();
    }
  });

  it("isolates drafts to the author in my routines and excludes drafts from community search", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage, id("pract-a"), "a@example.com");
      const other = await seedPractitioner(storage, id("pract-b"), "b@example.com");
      await routinesDraftOnly(storage, author, "Secret draft");
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        other,
      );
      await publishRoutine(storage, other, {
        name: "Shared",
        routineId: id("routine-pub"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);

      const mine = await service.listMyRoutines({ practitionerId: author });
      expect(mine.drafts).toHaveLength(1);
      expect(mine.drafts[0]?.name).toBe("Secret draft");

      const otherList = await service.listMyRoutines({ practitionerId: other });
      expect(otherList.drafts).toHaveLength(0);

      const search = await service.searchCommunityRoutines({ practitionerId: author });
      expect(search.routines).toHaveLength(1);
      expect(search.routines[0]?.name).toBe("Shared");
    } finally {
      storage.close();
    }
  });

  it("save, remove with undo, update flag, adopt whole copy with undo, and keep my copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-community"),
        "c@example.com",
      );
      const saver = await seedPractitioner(storage, id("pract-saver"), "s@example.com");
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId, published: v1 } = await publishRoutine(storage, author, {
        name: "Community knee",
        routineId: id("routine-save"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const versions = new RoutineVersionsRepository(storage);
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);

      const save = await service.saveToMyRoutines(saver, routineId);
      const details = await service.getRoutineDetails(saver, routineId);
      expect(details.my_copy).not.toBeNull();
      expect(details.my_copy?.community_updated).toBe(false);

      await versions.savePublishedVersion({
        id: id("rv-v2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Community knee v2",
        copyFromVersionId: v1.id,
      });

      const flagged = await service.getRoutineDetails(saver, routineId);
      expect(flagged.my_copy?.community_updated).toBe(true);

      await service.updateMyCopy({
        practitionerId: saver,
        routineId,
        rows: [
          {
            position: 0,
            exerciseId,
            exerciseVersionId: versionId,
            prescriptionType: "stretching",
            params: { hold_s: 45, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });

      const adopt = await service.adoptCommunityVersion(saver, routineId);
      expect(adopt.adopted_version).toBe(2);
      const afterAdopt = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(saver, routineId);
      expect(afterAdopt?.source_version_number).toBe(2);
      expect(afterAdopt?.edited).toBe(0);
      const adoptedRows = await new PractitionerRoutineRowsRepository(
        storage,
      ).listForCopy(afterAdopt!.id);
      expect(adoptedRows[0]?.params_json).toContain('"hold_s":30');

      await service.applyUndo(saver, routineId, adopt.undo);
      const undone = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(saver, routineId);
      expect(undone?.source_version_number).toBe(1);
      const undoneRows = await new PractitionerRoutineRowsRepository(
        storage,
      ).listForCopy(undone!.id);
      expect(undoneRows[0]?.params_json).toContain('"hold_s":45');

      const keep = await service.keepMyCopyVersion(saver, routineId);
      await service.applyUndo(saver, routineId, keep.undo);

      const remove = await service.removeFromMyRoutines(saver, routineId);
      await expect(
        service.getRoutineDetails(saver, routineId).then((result) => result.my_copy),
      ).resolves.toBeNull();
      await service.applyUndo(saver, routineId, remove.undo);
      const restored = await service.getRoutineDetails(saver, routineId);
      expect(restored.my_copy).not.toBeNull();

      await service.applyUndo(saver, routineId, save.undo);
      await expect(service.removeFromMyRoutines(saver, routineId)).rejects.toThrow(
        RoutinesLibraryServiceError,
      );
    } finally {
      storage.close();
    }
  });

  it("includes usage totals and sent program codes on routine details without patient fields", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId, published } = await publishRoutine(storage, author, {
        name: "Tracked routine",
        routineId: id("routine-tracked"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-sent"),
        createdBy: author,
        createdAt: TS,
        name: "Week one",
        routineOrigin: {
          routineId,
          routineVersionId: published.id,
          origin: "used_as_is",
        },
      });
      const program = await programs.findById(id("prog-sent"));
      await storage.run(
        `UPDATE programs
         SET published_version = 1, published_name = ?, published_at = ?, published_snapshot_json = ?
         WHERE id = ?`,
        ["Week one", TS, "{}", program!.id],
      );

      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      const details = await service.getRoutineDetails(author, routineId);
      expect(details.community.usage_count).toBeGreaterThanOrEqual(1);
      expect(details.sent_program_count).toBe(1);
      expect(details.sent_program_codes.length).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("searchRoutinesForMcp returns only published community routines", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      await publishRoutine(storage, author, {
        name: "Bridge starter",
        routineId: id("rtn-bridge"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      await routinesDraftOnly(storage, author);
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      const result = await service.searchRoutinesForMcp({
        practitionerId: author,
        query: "bridge",
      });
      expect(result.routines).toHaveLength(1);
      expect(result.routines[0]?.source).toBe("community");
    } finally {
      storage.close();
    }
  });
});

async function routinesDraftOnly(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  name = "Hidden draft",
) {
  const routines = new RoutinesRepository(storage);
  await routines.createDraft({
    id: id("routine-draft-only"),
    draftVersionId: id("rv-draft-only"),
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
    name,
  });
}
