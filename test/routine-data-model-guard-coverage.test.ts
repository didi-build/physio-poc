import { describe, expect, it } from "vitest";
import { FreeTextValidationError } from "../src/domain/exercise-free-text.js";
import { OpaqueEntityIdValidationError } from "../src/domain/opaque-entity-id.js";
import { MAX_LENGTH_PROGRAM_TITLE } from "../src/mcp-connector/text-limits.js";
import { ParamValidationError } from "../src/domain/exercise-params.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import type { SqlValue } from "../src/storage/ports/sql-storage.js";
import {
  ConditionsRepository,
  loadPublishedRoutineVersionForRoutine,
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../src/storage/repositories/routines.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const BODY_REGION_KNEE = "br-knee";
const BAD_OPAQUE = "John-Smith-knee";
const VALID_PARAMS = {
  hold_s: 30,
  per_day: { min: 1, max: 2 },
  days_per_week: 7,
} as const;
const INVALID_PARAMS = { hold_s: 9999 } as const;

function expectOpaqueFieldRejection(
  run: () => Promise<unknown>,
  fieldLabel: string,
  testLabel: string,
): Promise<void> {
  return expect(run(), testLabel).rejects.toSatisfy((error: unknown) => {
    return (
      error instanceof OpaqueEntityIdValidationError &&
      error.message === `${fieldLabel} must be a UUID v4 opaque id`
    );
  });
}

async function countRows(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  sql: string,
  bindings: readonly SqlValue[] = [],
): Promise<number> {
  const row = await storage.first<{ c: number }>(sql, bindings);
  return row?.c ?? 0;
}

describe("routine repository guard coverage (QA mutation gaps)", () => {
  it("rejects empty body region on updateDraftMetadata", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("guard-update-region"),
        draftVersionId: id("guard-update-region-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await expect(
        routines.updateDraftMetadata({
          routineId: id("guard-update-region"),
          authorId: author,
          draftUpdatedAt: TS,
          bodyRegionId: "   ",
        }),
      ).rejects.toThrow("Body region id must not be empty");
    } finally {
      storage.close();
    }
  });

  it("rejects partial program routine origin trios via ProgramsRepository.create", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      await routines.createDraft({
        id: id("guard-origin-routine"),
        draftVersionId: id("guard-origin-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("guard-origin-row"),
        routineId: id("guard-origin-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("guard-origin-routine"),
        authorId: author,
        publishedAt: TS,
        name: "Origin routine",
      });
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.create({
          id: id("guard-partial-origin-create"),
          createdBy: author,
          createdAt: TS,
          routineOrigin: {
            routineId: id("guard-origin-routine"),
            routineVersionId: published.id,
            origin: null,
          } as unknown as {
            routineId: string;
            routineVersionId: string;
            origin: "used_as_is";
          },
        }),
      ).rejects.toThrow(
        "Program routine origin requires routine id, version id, and origin together",
      );
    } finally {
      storage.close();
    }
  });

  it("rejects partial program routine origin trios via ProgramsRepository.setRoutineOrigin", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      await routines.createDraft({
        id: id("guard-set-origin-routine"),
        draftVersionId: id("guard-set-origin-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("guard-set-origin-row"),
        routineId: id("guard-set-origin-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("guard-set-origin-routine"),
        authorId: author,
        publishedAt: TS,
        name: "Set origin routine",
      });
      const programs = new ProgramsRepository(storage);
      const scratch = await programs.create({
        id: id("guard-set-origin-prog"),
        createdBy: author,
        createdAt: TS,
      });
      await expect(
        programs.setRoutineOrigin(scratch.id, {
          routineId: id("guard-set-origin-routine"),
          routineVersionId: published.id,
          usedAs: null,
        } as unknown as {
          routineId: string;
          routineVersionId: string;
          usedAs: "tweaked";
        }),
      ).rejects.toThrow(
        "Program routine origin requires routine id, version id, and origin together",
      );
    } finally {
      storage.close();
    }
  });

  it("rejects updateDraftMetadata, publishDraft, and replaceDraftRow when the routine is missing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const missingRoutineId = id("guard-missing-routine");
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      await expect(
        routines.updateDraftMetadata({
          routineId: missingRoutineId,
          authorId: author,
          draftUpdatedAt: TS,
          name: "Ghost",
        }),
      ).rejects.toThrow("Routine not found");
      await expect(
        versions.publishDraft({
          routineId: missingRoutineId,
          authorId: author,
          publishedAt: TS,
          name: "Ghost publish",
        }),
      ).rejects.toThrow("Routine not found");
      await expect(
        rows.replaceDraftRow({
          id: id("guard-missing-row"),
          routineId: missingRoutineId,
          authorId: author,
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: VALID_PARAMS,
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow("Routine not found");
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise params and prescription types on routine row writes and reads", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const myRows = new PractitionerRoutineRowsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);

      await routines.createDraft({
        id: id("guard-params-routine"),
        draftVersionId: id("guard-params-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });

      await expect(
        rows.replaceDraftRow({
          id: id("guard-params-bad"),
          routineId: id("guard-params-routine"),
          authorId: author,
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: INVALID_PARAMS,
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow(ParamValidationError);

      await rows.replaceDraftRow({
        id: id("guard-params-ok"),
        routineId: id("guard-params-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });

      const published = await versions.publishDraft({
        routineId: id("guard-params-routine"),
        authorId: author,
        publishedAt: TS,
        name: "Params routine",
      });

      await expect(
        versions.savePublishedVersion({
          id: id("guard-params-v2"),
          routineId: id("guard-params-routine"),
          createdBy: author,
          createdAt: TS,
          name: "Params v2",
          copyFromVersionId: published.id,
          restoredFromVersionId: published.id,
        }),
      ).resolves.toBeDefined();

      const draft = await versions.findDraftForRoutine(id("guard-params-routine"));
      expect(draft).toBeNull();

      await expect(
        rows.insertRow({
          id: id("guard-insert-bad-params"),
          routineVersionId: published.id,
          position: 1,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: INVALID_PARAMS,
        }),
      ).rejects.toThrow(ParamValidationError);

      await storage.run("PRAGMA ignore_check_constraints = 1");
      await storage.run(
        `UPDATE routine_version_rows SET prescription_type = ? WHERE routine_version_id = ?`,
        ["cardio", published.id],
      );
      await storage.run("PRAGMA ignore_check_constraints = 0");
      await expect(rows.listForVersion(published.id)).rejects.toThrow(
        "Invalid prescription type: cardio",
      );

      const saved = await my.saveFrozenCopy({
        id: id("guard-my-copy"),
        practitionerId: author,
        routineId: id("guard-params-routine"),
        sourceRoutineVersionId: published.id,
        savedAt: TS,
        rows: [
          {
            id: id("guard-my-row"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: VALID_PARAMS,
          },
        ],
      });

      await expect(
        myRows.insertRow({
          id: id("guard-my-bad-params"),
          practitionerRoutineId: saved.id,
          position: 1,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: INVALID_PARAMS,
        }),
      ).rejects.toThrow(ParamValidationError);

      await expect(
        myRows.replaceRow({
          id: id("guard-my-replace-bad-params"),
          practitionerRoutineId: saved.id,
          position: 1,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: INVALID_PARAMS,
        }),
      ).rejects.toThrow(ParamValidationError);

      await storage.run("PRAGMA ignore_check_constraints = 1");
      await storage.run(
        `UPDATE practitioner_routine_rows SET prescription_type = ? WHERE practitioner_routine_id = ?`,
        ["cardio", saved.id],
      );
      await storage.run("PRAGMA ignore_check_constraints = 0");
      await expect(myRows.listForCopy(saved.id)).rejects.toThrow(
        "Invalid prescription type: cardio",
      );
    } finally {
      storage.close();
    }
  });
});

describe("routine repository opaque entity id validation (table-driven)", () => {
  it("rejects malformed ids at every validateOpaqueEntityId call site", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const conditions = new ConditionsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);
      const myRows = new PractitionerRoutineRowsRepository(storage);
      const programs = new ProgramsRepository(storage);

      await routines.createDraft({
        id: id("opaque-base-routine"),
        draftVersionId: id("opaque-base-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await routines.createDraft({
        id: id("opaque-draft-routine"),
        draftVersionId: id("opaque-draft-rv"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("opaque-base-row"),
        routineId: id("opaque-base-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("opaque-base-routine"),
        authorId: author,
        publishedAt: TS,
        name: "Opaque base",
      });

      const scratch = await programs.create({
        id: id("opaque-prog-set-base"),
        createdBy: author,
        createdAt: TS,
      });
      const cases: {
        label: string;
        fieldLabel: string;
        run: () => Promise<unknown>;
      }[] = [
        {
          label: "loadPublished routineId",
          fieldLabel: "Routine id",
          run: () =>
            loadPublishedRoutineVersionForRoutine(
              storage,
              BAD_OPAQUE,
              published.id,
              "routineVersionId",
            ),
        },
        {
          label: "loadPublished routineVersionId",
          fieldLabel: "Routine version id",
          run: () =>
            loadPublishedRoutineVersionForRoutine(
              storage,
              id("opaque-base-routine"),
              BAD_OPAQUE,
              "routineVersionId",
            ),
        },
        {
          label: "ConditionsRepository.insert id",
          fieldLabel: "Condition id",
          run: () => conditions.insert({ id: BAD_OPAQUE, label: "Hip OA" }),
        },
        {
          label: "createDraft routine id",
          fieldLabel: "Routine id",
          run: () =>
            routines.createDraft({
              id: BAD_OPAQUE,
              draftVersionId: id("opaque-new-draft-ver"),
              createdBy: author,
              createdAt: TS,
              bodyRegionId: BODY_REGION_KNEE,
            }),
        },
        {
          label: "createDraft draftVersionId",
          fieldLabel: "Routine version id",
          run: () =>
            routines.createDraft({
              id: id("opaque-new-routine-2"),
              draftVersionId: BAD_OPAQUE,
              createdBy: author,
              createdAt: TS,
              bodyRegionId: BODY_REGION_KNEE,
            }),
        },
        {
          label: "createDraft conditionId",
          fieldLabel: "Condition id",
          run: () =>
            routines.createDraft({
              id: id("opaque-new-routine-3"),
              draftVersionId: id("opaque-new-draft-ver-3"),
              createdBy: author,
              createdAt: TS,
              bodyRegionId: BODY_REGION_KNEE,
              conditionId: BAD_OPAQUE,
            }),
        },
        {
          label: "updateDraftMetadata conditionId",
          fieldLabel: "Condition id",
          run: () =>
            routines.updateDraftMetadata({
              routineId: id("opaque-draft-routine"),
              authorId: author,
              draftUpdatedAt: TS,
              conditionId: BAD_OPAQUE,
            }),
        },
        {
          label: "savePublishedVersion id",
          fieldLabel: "Routine version id",
          run: () =>
            versions.savePublishedVersion({
              id: BAD_OPAQUE,
              routineId: id("opaque-base-routine"),
              createdBy: author,
              createdAt: TS,
              name: "Next",
              copyFromVersionId: published.id,
            }),
        },
        {
          label: "savePublishedVersion restoredFromVersionId",
          fieldLabel: "Restored from version id",
          run: () =>
            versions.savePublishedVersion({
              id: id("opaque-save-v3"),
              routineId: id("opaque-base-routine"),
              createdBy: author,
              createdAt: TS,
              name: "Next",
              copyFromVersionId: published.id,
              restoredFromVersionId: BAD_OPAQUE,
            }),
        },
        {
          label: "RoutineVersionRowsRepository.insertRow id",
          fieldLabel: "Routine version row id",
          run: () =>
            rows.insertRow({
              id: BAD_OPAQUE,
              routineVersionId: published.id,
              position: 2,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "RoutineVersionRowsRepository.insertRow routineVersionId",
          fieldLabel: "Routine version id",
          run: () =>
            rows.insertRow({
              id: id("opaque-insert-row"),
              routineVersionId: BAD_OPAQUE,
              position: 2,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "RoutineVersionRowsRepository.insertRow exerciseId",
          fieldLabel: "Exercise id",
          run: () =>
            rows.insertRow({
              id: id("opaque-insert-row-2"),
              routineVersionId: published.id,
              position: 2,
              exerciseId: BAD_OPAQUE,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "RoutineVersionRowsRepository.insertRow exerciseVersionId",
          fieldLabel: "Exercise version id",
          run: () =>
            rows.insertRow({
              id: id("opaque-insert-row-3"),
              routineVersionId: published.id,
              position: 2,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: BAD_OPAQUE,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "replaceDraftRow id",
          fieldLabel: "Routine version row id",
          run: () =>
            rows.replaceDraftRow({
              id: BAD_OPAQUE,
              routineId: id("opaque-draft-routine"),
              authorId: author,
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
              draftUpdatedAt: TS,
            }),
        },
        {
          label: "replaceDraftRow exerciseId",
          fieldLabel: "Exercise id",
          run: () =>
            rows.replaceDraftRow({
              id: id("opaque-replace-row"),
              routineId: id("opaque-draft-routine"),
              authorId: author,
              position: 0,
              exerciseId: BAD_OPAQUE,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
              draftUpdatedAt: TS,
            }),
        },
        {
          label: "replaceDraftRow exerciseVersionId",
          fieldLabel: "Exercise version id",
          run: () =>
            rows.replaceDraftRow({
              id: id("opaque-replace-row-2"),
              routineId: id("opaque-draft-routine"),
              authorId: author,
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: BAD_OPAQUE,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
              draftUpdatedAt: TS,
            }),
        },
        {
          label: "saveFrozenCopy id",
          fieldLabel: "Practitioner routine id",
          run: () =>
            my.saveFrozenCopy({
              id: BAD_OPAQUE,
              practitionerId: author,
              routineId: id("opaque-base-routine"),
              sourceRoutineVersionId: published.id,
              savedAt: TS,
              rows: [
                {
                  id: id("opaque-copy-row"),
                  position: 0,
                  exerciseId: FIXTURE_EXERCISE_ID,
                  exerciseVersionId: FIXTURE_VERSION_ID,
                  prescriptionType: "stretching",
                  params: VALID_PARAMS,
                },
              ],
            }),
        },
        {
          label: "saveFrozenCopy routineId",
          fieldLabel: "Routine id",
          run: () =>
            my.saveFrozenCopy({
              id: id("opaque-copy-bad-routine"),
              practitionerId: author,
              routineId: BAD_OPAQUE,
              sourceRoutineVersionId: published.id,
              savedAt: TS,
              rows: [
                {
                  id: id("opaque-copy-row-2"),
                  position: 0,
                  exerciseId: FIXTURE_EXERCISE_ID,
                  exerciseVersionId: FIXTURE_VERSION_ID,
                  prescriptionType: "stretching",
                  params: VALID_PARAMS,
                },
              ],
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.insertRow id",
          fieldLabel: "Practitioner routine row id",
          run: () =>
            myRows.insertRow({
              id: BAD_OPAQUE,
              practitionerRoutineId: id("opaque-never-copy"),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.insertRow practitionerRoutineId",
          fieldLabel: "Practitioner routine id",
          run: () =>
            myRows.insertRow({
              id: id("opaque-my-row"),
              practitionerRoutineId: BAD_OPAQUE,
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.insertRow exerciseId",
          fieldLabel: "Exercise id",
          run: () =>
            myRows.insertRow({
              id: id("opaque-my-row-2"),
              practitionerRoutineId: id("opaque-never-copy"),
              position: 0,
              exerciseId: BAD_OPAQUE,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.insertRow exerciseVersionId",
          fieldLabel: "Exercise version id",
          run: () =>
            myRows.insertRow({
              id: id("opaque-my-row-3"),
              practitionerRoutineId: id("opaque-never-copy"),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: BAD_OPAQUE,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.replaceRow id",
          fieldLabel: "Practitioner routine row id",
          run: () =>
            myRows.replaceRow({
              id: BAD_OPAQUE,
              practitionerRoutineId: id("opaque-never-copy"),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.replaceRow practitionerRoutineId",
          fieldLabel: "Practitioner routine id",
          run: () =>
            myRows.replaceRow({
              id: id("opaque-my-replace"),
              practitionerRoutineId: BAD_OPAQUE,
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.replaceRow exerciseId",
          fieldLabel: "Exercise id",
          run: () =>
            myRows.replaceRow({
              id: id("opaque-my-replace-2"),
              practitionerRoutineId: id("opaque-never-copy"),
              position: 0,
              exerciseId: BAD_OPAQUE,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "PractitionerRoutineRowsRepository.replaceRow exerciseVersionId",
          fieldLabel: "Exercise version id",
          run: () =>
            myRows.replaceRow({
              id: id("opaque-my-replace-3"),
              practitionerRoutineId: id("opaque-never-copy"),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: BAD_OPAQUE,
              prescriptionType: "stretching",
              params: VALID_PARAMS,
            }),
        },
        {
          label: "ProgramsRepository.create source routine id",
          fieldLabel: "Source routine id",
          run: () =>
            programs.create({
              id: id("opaque-prog-create"),
              createdBy: author,
              createdAt: TS,
              routineOrigin: {
                routineId: BAD_OPAQUE,
                routineVersionId: published.id,
                origin: "used_as_is",
              },
            }),
        },
        {
          label: "ProgramsRepository.create source routine version id",
          fieldLabel: "Source routine version id",
          run: () =>
            programs.create({
              id: id("opaque-prog-create-2"),
              createdBy: author,
              createdAt: TS,
              routineOrigin: {
                routineId: id("opaque-base-routine"),
                routineVersionId: BAD_OPAQUE,
                origin: "used_as_is",
              },
            }),
        },
        {
          label: "ProgramsRepository.setRoutineOrigin routine id",
          fieldLabel: "Source routine id",
          run: () =>
            programs.setRoutineOrigin(scratch.id, {
              routineId: BAD_OPAQUE,
              routineVersionId: published.id,
              usedAs: "tweaked",
            }),
        },
        {
          label: "ProgramsRepository.setRoutineOrigin routine version id",
          fieldLabel: "Source routine version id",
          run: () =>
            programs.setRoutineOrigin(scratch.id, {
              routineId: id("opaque-base-routine"),
              routineVersionId: BAD_OPAQUE,
              usedAs: "tweaked",
            }),
        },
      ];

      for (const { label, fieldLabel, run } of cases) {
        await expectOpaqueFieldRejection(run, fieldLabel, label);
      }
    } finally {
      storage.close();
    }
  });

  it("rejects malformed copyFromVersionId via savePublishedVersion", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      await routines.createDraft({
        id: id("opaque-copyfrom-routine"),
        draftVersionId: id("opaque-copyfrom-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("opaque-copyfrom-row"),
        routineId: id("opaque-copyfrom-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });
      await versions.publishDraft({
        routineId: id("opaque-copyfrom-routine"),
        authorId: author,
        publishedAt: TS,
        name: "Copy from opaque",
      });
      await expectOpaqueFieldRejection(
        () =>
          versions.savePublishedVersion({
            id: id("opaque-copyfrom-v2"),
            routineId: id("opaque-copyfrom-routine"),
            createdBy: author,
            createdAt: TS,
            name: "Next",
            copyFromVersionId: BAD_OPAQUE,
          }),
        "Routine version id",
        "copyFromVersionId malformed",
      );
    } finally {
      storage.close();
    }
  });
});

describe("routine repository opaque id on saveFrozenCopy source version", () => {
  it("rejects malformed sourceRoutineVersionId", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);
      await routines.createDraft({
        id: id("opaque-src-routine"),
        draftVersionId: id("opaque-src-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("opaque-src-row"),
        routineId: id("opaque-src-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });
      await versions.publishDraft({
        routineId: id("opaque-src-routine"),
        authorId: author,
        publishedAt: TS,
        name: "Source opaque",
      });
      await expectOpaqueFieldRejection(
        () =>
          my.saveFrozenCopy({
            id: id("opaque-src-copy"),
            practitionerId: author,
            routineId: id("opaque-src-routine"),
            sourceRoutineVersionId: BAD_OPAQUE,
            savedAt: TS,
            rows: [
              {
                id: id("opaque-src-copy-row"),
                position: 0,
                exerciseId: FIXTURE_EXERCISE_ID,
                exerciseVersionId: FIXTURE_VERSION_ID,
                prescriptionType: "stretching",
                params: VALID_PARAMS,
              },
            ],
          }),
        "Routine version id",
        "sourceRoutineVersionId malformed",
      );
    } finally {
      storage.close();
    }
  });
});

describe("validateConditionLabel (unit via ConditionsRepository)", () => {
  it("rejects empty and over-length labels with exact messages", async () => {
    const storage = await openMigratedDatabase();
    try {
      const conditions = new ConditionsRepository(storage);
      await expect(
        conditions.insert({ id: id("cond-empty-label"), label: "   " }),
      ).rejects.toThrow(
        new FreeTextValidationError("Condition label must not be empty"),
      );
      const tooLong = "A".repeat(MAX_LENGTH_PROGRAM_TITLE + 1);
      await expect(
        conditions.insert({ id: id("cond-long-label"), label: tooLong }),
      ).rejects.toThrow(
        new FreeTextValidationError(
          `Condition label must be at most ${String(MAX_LENGTH_PROGRAM_TITLE)} characters`,
        ),
      );
    } finally {
      storage.close();
    }
  });
});

describe("opaque id validation prevents partial writes", () => {
  it("leaves routine_versions and practitioner_routines unchanged when version or copy ids are malformed", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);
      await routines.createDraft({
        id: id("no-write-routine"),
        draftVersionId: id("no-write-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("no-write-row"),
        routineId: id("no-write-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("no-write-routine"),
        authorId: author,
        publishedAt: TS,
        name: "No write routine",
      });
      const versionCountBefore = await countRows(
        storage,
        "SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ?",
        [id("no-write-routine")],
      );
      await expectOpaqueFieldRejection(
        () =>
          versions.savePublishedVersion({
            id: BAD_OPAQUE,
            routineId: id("no-write-routine"),
            createdBy: author,
            createdAt: TS,
            name: "Should not save",
            copyFromVersionId: published.id,
          }),
        "Routine version id",
        "savePublishedVersion malformed id",
      );
      expect(
        await countRows(
          storage,
          "SELECT COUNT(*) AS c FROM routine_versions WHERE routine_id = ?",
          [id("no-write-routine")],
        ),
      ).toBe(versionCountBefore);
      expect(
        await storage.first("SELECT id FROM routine_versions WHERE id = ? LIMIT 1", [
          BAD_OPAQUE,
        ]),
      ).toBeNull();

      const copyCountBefore = await countRows(
        storage,
        "SELECT COUNT(*) AS c FROM practitioner_routines WHERE practitioner_id = ?",
        [author],
      );
      await expectOpaqueFieldRejection(
        () =>
          my.saveFrozenCopy({
            id: BAD_OPAQUE,
            practitionerId: author,
            routineId: id("no-write-routine"),
            sourceRoutineVersionId: published.id,
            savedAt: TS,
            rows: [
              {
                id: id("no-write-copy-row"),
                position: 0,
                exerciseId: FIXTURE_EXERCISE_ID,
                exerciseVersionId: FIXTURE_VERSION_ID,
                prescriptionType: "stretching",
                params: VALID_PARAMS,
              },
            ],
          }),
        "Practitioner routine id",
        "saveFrozenCopy malformed id",
      );
      expect(
        await countRows(
          storage,
          "SELECT COUNT(*) AS c FROM practitioner_routines WHERE practitioner_id = ?",
          [author],
        ),
      ).toBe(copyCountBefore);
      expect(
        await storage.first(
          "SELECT id FROM practitioner_routines WHERE id = ? LIMIT 1",
          [BAD_OPAQUE],
        ),
      ).toBeNull();
    } finally {
      storage.close();
    }
  });
});

describe("opaque id normalization on write paths", () => {
  it("stores lowercase UUIDs for program origin, restored-from, and frozen copy source version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const programs = new ProgramsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);

      await routines.createDraft({
        id: id("norm-routine"),
        draftVersionId: id("norm-rv-draft"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("norm-row"),
        routineId: id("norm-routine"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: VALID_PARAMS,
        draftUpdatedAt: TS,
      });
      const published = await versions.publishDraft({
        routineId: id("norm-routine"),
        authorId: author,
        publishedAt: TS,
        name: "Norm routine",
      });

      const upperRoutineId = id("norm-routine").toUpperCase();
      const upperVersionId = published.id.toUpperCase();
      const upperNewVersionId = id("norm-rv-v2").toUpperCase();

      const fromOrigin = await programs.create({
        id: id("norm-prog-origin"),
        createdBy: author,
        createdAt: TS,
        routineOrigin: {
          routineId: upperRoutineId,
          routineVersionId: upperVersionId,
          origin: "used_as_is",
        },
      });
      expect(fromOrigin.source_routine_id).toBe(id("norm-routine"));
      expect(fromOrigin.source_routine_version_id).toBe(published.id);

      const scratch = await programs.create({
        id: id("norm-prog-set"),
        createdBy: author,
        createdAt: TS,
      });
      await programs.setRoutineOrigin(scratch.id, {
        routineId: upperRoutineId,
        routineVersionId: upperVersionId,
        usedAs: "tweaked",
      });
      const updated = await programs.findById(scratch.id);
      expect(updated?.source_routine_id).toBe(id("norm-routine"));
      expect(updated?.source_routine_version_id).toBe(published.id);

      const savedV2 = await versions.savePublishedVersion({
        id: upperNewVersionId,
        routineId: id("norm-routine"),
        createdBy: author,
        createdAt: TS,
        name: "Norm v2",
        copyFromVersionId: published.id,
        restoredFromVersionId: upperVersionId,
      });
      expect(savedV2.id).toBe(id("norm-rv-v2"));
      expect(savedV2.restored_from_version_id).toBe(published.id);

      const savedCopy = await my.saveFrozenCopy({
        id: id("norm-my-copy"),
        practitionerId: author,
        routineId: id("norm-routine"),
        sourceRoutineVersionId: upperVersionId,
        savedAt: TS,
        rows: [
          {
            id: id("norm-my-row"),
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: VALID_PARAMS,
          },
        ],
      });
      expect(savedCopy.source_routine_version_id).toBe(published.id);
    } finally {
      storage.close();
    }
  });
});
