import { describe, expect, it } from "vitest";
import { ConditionsRepository } from "../src/storage/repositories/routines.js";
import {
  RoutinesLibraryService,
  RoutinesLibraryServiceError,
} from "../src/services/routines/index.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedExercise,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { installRealStaleDeleteCopyFixture } from "./helpers/routines-delete-batch-fixture.js";
import { SqlBatchGuardError } from "../src/storage/errors/sql-batch-error.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import {
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import { personalChangesUnavailable } from "../src/services/routines/routine-personal-change-projection.js";

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

      const editedDetails = await service.getRoutineDetails(saver, routineId);
      expect(editedDetails.personal_changes).toMatchObject({
        baseline_available: true,
        change_count: 1,
        your_change_positions: [0],
      });
      expect(editedDetails.community_change_list).toEqual({
        baseline_available: true,
        entries: [{ version_number: 2, change_summary: null }],
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

  it("getRoutineDetails personal_changes baseline unavailable when baseline version row is missing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId, published: v1 } = await publishRoutine(storage, author, {
        name: "Baseline missing",
        routineId: id("routine-baseline-missing"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      const versions = new RoutineVersionsRepository(storage);
      await service.saveToMyRoutines(author, routineId);
      await versions.savePublishedVersion({
        id: id("rv-baseline-missing-v2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Baseline missing v2",
        copyFromVersionId: v1.id,
      });
      await storage.run(
        `DELETE FROM routine_version_rows WHERE routine_version_id = ?`,
        [v1.id],
      );
      await storage.run("PRAGMA foreign_keys = OFF");
      await storage.run(`DELETE FROM routine_versions WHERE id = ?`, [v1.id]);
      await storage.run("PRAGMA foreign_keys = ON");
      await expect(service.getRoutineDetails(author, routineId)).resolves.toMatchObject(
        {
          personal_changes: personalChangesUnavailable(),
        },
      );
    } finally {
      storage.close();
    }
  });

  it("getRoutineDetails personal_changes baseline unavailable when baseline version belongs to another routine", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId, published: v1 } = await publishRoutine(storage, author, {
        name: "Baseline mismatch A",
        routineId: id("routine-baseline-mismatch-a"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const { published: vOther } = await publishRoutine(storage, author, {
        name: "Baseline mismatch B",
        routineId: id("routine-baseline-mismatch-b"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      const copy = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(author, routineId);
      await storage.run(
        `UPDATE practitioner_routines SET source_routine_version_id = ? WHERE id = ?`,
        [vOther.id, copy!.id],
      );
      await expect(service.getRoutineDetails(author, routineId)).resolves.toMatchObject(
        {
          personal_changes: personalChangesUnavailable(),
        },
      );
      await storage.run(
        `UPDATE practitioner_routines SET source_routine_version_id = ? WHERE id = ?`,
        [v1.id, copy!.id],
      );
    } finally {
      storage.close();
    }
  });

  it("getRoutineDetails personal_changes baseline unavailable when baseline version is not published", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Baseline draft",
        routineId: id("routine-baseline-draft"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      const draftBaselineId = id("rv-unpublished-baseline");
      await storage.run(
        `INSERT INTO routine_versions (
          id, routine_id, version_number, status, name,
          change_summary, restored_from_version_id, created_by, created_at
        ) VALUES (?, ?, 0, 'draft', 'draft', NULL, NULL, ?, ?)`,
        [draftBaselineId, routineId, author, TS],
      );
      const copy = await new PractitionerRoutinesRepository(
        storage,
      ).findForPractitioner(author, routineId);
      await storage.run(
        `UPDATE practitioner_routines SET source_routine_version_id = ? WHERE id = ?`,
        [draftBaselineId, copy!.id],
      );
      await expect(service.getRoutineDetails(author, routineId)).resolves.toMatchObject(
        {
          personal_changes: personalChangesUnavailable(),
        },
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
      if (details.is_draft) {
        throw new Error("expected published routine");
      }
      expect(details.community.usage_count).toBeGreaterThanOrEqual(1);
      expect(details.sent_program_count).toBe(1);
      expect(details.sent_program_codes.length).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("replaceMyCopyRows drops positions not in the new list", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-orphan-a"),
        "a@example.com",
      );
      const saver = await seedPractitioner(
        storage,
        id("pract-orphan-b"),
        "b@example.com",
      );
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const secondExercise = await seedExercise(
        storage,
        author,
        id("ex-second-orphan"),
      );
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) SELECT ?, ?, 1, 'approved', ?, ?, 'Second move', description, equipment,
          starting_position, steps, common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        FROM exercise_versions WHERE id = ? LIMIT 1`,
        [id("ver-second-orphan"), secondExercise, author, TS, versionId],
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Two exercise slots",
        routineId: id("routine-orphan"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(saver, routineId);
      const my = new PractitionerRoutinesRepository(storage);
      const copy = await my.findForPractitioner(saver, routineId);
      const rowRepo = new PractitionerRoutineRowsRepository(storage);
      await rowRepo.replaceRow({
        id: id("prr-second"),
        practitionerRoutineId: copy!.id,
        position: 1,
        exerciseId: secondExercise,
        exerciseVersionId: id("ver-second-orphan"),
        prescriptionType: "stretching",
        params: { hold_s: 20, per_day: { min: 1, max: 2 }, days_per_week: 7 },
      });
      expect((await rowRepo.listForCopy(copy!.id)).length).toBe(2);

      await service.updateMyCopy({
        practitionerId: saver,
        routineId,
        rows: [
          {
            position: 0,
            exerciseId,
            exerciseVersionId: versionId,
            prescriptionType: "stretching",
            params: { hold_s: 55, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      const rows = await rowRepo.listForCopy(copy!.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.position).toBe(0);
      expect(rows[0]?.params_json).toContain('"hold_s":55');
    } finally {
      storage.close();
    }
  });

  it("rejects an empty my copy row list", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Non empty source",
        routineId: id("routine-no-empty"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      await expect(
        service.updateMyCopy({ practitionerId: author, routineId, rows: [] }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("restoreSavedCopyFromSnapshot leaves the prior copy intact when the batch fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId, published } = await publishRoutine(storage, author, {
        name: "Restore guard",
        routineId: id("routine-restore-guard"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const my = new PractitionerRoutinesRepository(storage);
      const saved = await my.saveFrozenCopy({
        id: id("pr-restore-guard"),
        practitionerId: author,
        routineId,
        sourceRoutineVersionId: published.id,
        savedAt: TS,
        rows: [
          {
            id: id("prr-restore-guard"),
            position: 0,
            exerciseId,
            exerciseVersionId: versionId,
            prescriptionType: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      const rowRepo = new PractitionerRoutineRowsRepository(storage);
      const beforeRows = await rowRepo.listForCopy(saved.id);

      await expect(
        my.restoreSavedCopyFromSnapshot({
          practitionerId: author,
          routineId,
          snapshot: {
            id: saved.id,
            source_routine_version_id: published.id,
            source_version_number: 1,
            saved_at: TS,
            last_used_at: null,
            edited: 1,
            rows: [
              {
                position: 0,
                exercise_id: exerciseId,
                exercise_version_id: id("missing-version-id"),
                prescription_type: "stretching",
                params_json: JSON.stringify({
                  hold_s: 99,
                  per_day: { min: 1, max: 2 },
                  days_per_week: 7,
                }),
              },
            ],
          },
        }),
      ).rejects.toThrow();

      const after = await my.findForPractitioner(author, routineId);
      expect(after?.source_version_number).toBe(saved.source_version_number);
      const afterRows = await rowRepo.listForCopy(saved.id);
      expect(afterRows).toEqual(beforeRows);
    } finally {
      storage.close();
    }
  });

  it("deleteCopy batch rolls back child rows when parent practitioner guard fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-del-rollback-a"),
        "del@example.com",
      );
      const wrongPractitioner = await seedPractitioner(
        storage,
        id("pract-del-rollback-wrong"),
        "wrong@example.com",
      );
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Delete rollback",
        routineId: id("routine-del-rollback"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      const my = new PractitionerRoutinesRepository(storage);
      const copy = await my.findForPractitioner(author, routineId);
      const rowRepo = new PractitionerRoutineRowsRepository(storage);
      const beforeRows = await rowRepo.listForCopy(copy!.id);

      let caught: unknown;
      try {
        await storage.batch(
          my.buildDeleteCopyBatchStatements(copy!.id, wrongPractitioner),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(SqlBatchGuardError);
      expect(await rowRepo.listForCopy(copy!.id)).toEqual(beforeRows);
      expect(await my.findForPractitioner(author, routineId)).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("removeFromMyRoutines maps deleteCopy stale_write to a typed service error", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-stale-remove"),
        "rm@example.com",
      );
      const wrongPractitioner = await seedPractitioner(
        storage,
        id("pract-stale-remove-wrong"),
        "rm-wrong@example.com",
      );
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Stale remove",
        routineId: id("routine-stale-remove"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      const restore = installRealStaleDeleteCopyFixture(wrongPractitioner);
      try {
        await expect(
          service.removeFromMyRoutines(author, routineId),
        ).rejects.toMatchObject({ code: "stale_write" });
      } finally {
        restore();
      }
      expect(
        await new PractitionerRoutinesRepository(storage).findForPractitioner(
          author,
          routineId,
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("applyUndo with had_copy false maps deleteCopy stale_write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-stale-undo-del"),
        "ud@example.com",
      );
      const wrongPractitioner = await seedPractitioner(
        storage,
        id("pract-stale-undo-del-wrong"),
        "ud-wrong@example.com",
      );
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Stale undo delete",
        routineId: id("routine-stale-undo-del"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      const { undo } = await service.saveToMyRoutines(author, routineId);
      const restore = installRealStaleDeleteCopyFixture(wrongPractitioner);
      try {
        await expect(service.applyUndo(author, routineId, undo)).rejects.toMatchObject({
          code: "stale_write",
        });
      } finally {
        restore();
      }
    } finally {
      storage.close();
    }
  });

  it("applyUndo with had_copy false and no saved copy succeeds without delete", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-undo-no-copy"),
        "nc@example.com",
      );
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Undo no prior copy",
        routineId: id("routine-undo-no-copy"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await expect(
        service.applyUndo(author, routineId, {
          practitioner_id: author,
          routine_id: routineId,
          snapshot: { had_copy: false, copy: null },
        }),
      ).resolves.toBeUndefined();
    } finally {
      storage.close();
    }
  });

  it("maps repository stale_write to a typed service error on my copy adopt", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-stale-save"),
        "c@example.com",
      );
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId, published: v1 } = await publishRoutine(storage, author, {
        name: "Stale adopt target",
        routineId: id("routine-stale-save"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      await new RoutineVersionsRepository(storage).savePublishedVersion({
        id: id("rv-stale-v2"),
        routineId,
        createdBy: author,
        createdAt: TS,
        name: "Stale adopt target v2",
        copyFromVersionId: v1.id,
      });
      const my = new PractitionerRoutinesRepository(storage);
      await expect(
        my.saveFrozenCopy({
          id: id("pr-stale-save"),
          practitionerId: author,
          routineId,
          sourceRoutineVersionId: v1.id,
          savedAt: TS,
          rows: [
            {
              id: id("prr-stale-save"),
              position: 0,
              exerciseId,
              exerciseVersionId: versionId,
              prescriptionType: "stretching",
              params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "stale_write" });

      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      const replace =
        PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished;
      PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished =
        async function staleStub() {
          throw new RoutineRepositoryError("Stale write", { code: "stale_write" });
        };
      try {
        await expect(
          service.adoptCommunityVersion(author, routineId),
        ).rejects.toMatchObject({
          code: "stale_write",
        });
      } finally {
        PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished =
          replace;
      }
    } finally {
      storage.close();
    }
  });

  it("applyUndo overwrites an intervening my copy edit (exercise-library undo contract)", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("pract-undo-edit"),
        "u@example.com",
      );
      const { exerciseId, versionId } = await seedApprovedExerciseVersion(
        storage,
        author,
      );
      const { routineId } = await publishRoutine(storage, author, {
        name: "Undo overwrite",
        routineId: id("routine-undo-overwrite"),
        exerciseId,
        exerciseVersionId: versionId,
      });
      const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyRoutines(author, routineId);
      const { undo } = await service.updateMyCopy({
        practitionerId: author,
        routineId,
        rows: [
          {
            position: 0,
            exerciseId,
            exerciseVersionId: versionId,
            prescriptionType: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      await service.updateMyCopy({
        practitionerId: author,
        routineId,
        rows: [
          {
            position: 0,
            exerciseId,
            exerciseVersionId: versionId,
            prescriptionType: "stretching",
            params: { hold_s: 99, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      await service.applyUndo(author, routineId, undo);
      const rows = await new PractitionerRoutineRowsRepository(storage).listForCopy(
        (await new PractitionerRoutinesRepository(storage).findForPractitioner(
          author,
          routineId,
        ))!.id,
      );
      expect(rows[0]?.params_json).toContain('"hold_s":30');
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
