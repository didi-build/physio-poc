import { describe, expect, it } from "vitest";
import { FreeTextValidationError } from "../src/domain/exercise-free-text.js";
import { ProgramsRepository } from "../src/storage/repositories/programs.js";
import {
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
  validateProgramRoutineOriginTrio,
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
const FAKE_DOB_SNIPPET = "DOB 1990-01-01";

type PublishSeeds = {
  routine: string;
  draftVersion: string;
  row: string;
  name: string;
};

async function publishRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  seeds: PublishSeeds,
  withRow = true,
) {
  const routines = new RoutinesRepository(storage);
  const rows = new RoutineVersionRowsRepository(storage);
  const versions = new RoutineVersionsRepository(storage);
  await routines.createDraft({
    id: id(seeds.routine),
    draftVersionId: id(seeds.draftVersion),
    createdBy: author,
    createdAt: TS,
    bodyRegionId: BODY_REGION_KNEE,
  });
  if (withRow) {
    await rows.replaceDraftRow({
      id: id(seeds.row),
      routineId: id(seeds.routine),
      authorId: author,
      position: 0,
      exerciseId: FIXTURE_EXERCISE_ID,
      exerciseVersionId: FIXTURE_VERSION_ID,
      prescriptionType: "stretching",
      params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
      draftUpdatedAt: TS,
    });
  }
  return versions.publishDraft({
    routineId: id(seeds.routine),
    authorId: author,
    publishedAt: TS,
    name: seeds.name,
  });
}

describe("QA round 1: program origin and saved copy version pinning (blockers)", () => {
  it("rejects program create when routine id and version id disagree", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const vA = await publishRoutine(storage, author, {
        routine: "qa-routine-a",
        draftVersion: "qa-rv-a",
        row: "qa-rvr-a",
        name: "Routine QA A",
      });
      const vB = await publishRoutine(storage, author, {
        routine: "qa-routine-b",
        draftVersion: "qa-rv-b",
        row: "qa-rvr-b",
        name: "Routine QA B",
      });
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.create({
          id: id("prog-wrong-version"),
          createdBy: author,
          createdAt: TS,
          routineOrigin: {
            routineId: id("qa-routine-a"),
            routineVersionId: vB.id,
            origin: "used_as_is",
          },
        }),
      ).rejects.toThrow("routineVersionId belongs to a different routine");
      await expect(
        programs.create({
          id: id("prog-wrong-version-2"),
          createdBy: author,
          createdAt: TS,
          routineOrigin: {
            routineId: id("qa-routine-a"),
            routineVersionId: vA.id,
            origin: "used_as_is",
          },
        }),
      ).resolves.toBeDefined();
    } finally {
      storage.close();
    }
  });

  it("rejects program create from an unpublished draft version id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("qa-draft-only"),
        draftVersionId: id("qa-draft-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.create({
          id: id("prog-from-draft"),
          createdBy: author,
          createdAt: TS,
          routineOrigin: {
            routineId: id("qa-draft-only"),
            routineVersionId: id("qa-draft-ver"),
            origin: "used_as_is",
          },
        }),
      ).rejects.toThrow("routineVersionId must be a published routine version");
    } finally {
      storage.close();
    }
  });

  it("rejects setRoutineOrigin when routine id and version id disagree", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      await publishRoutine(storage, author, {
        routine: "qa-origin-a",
        draftVersion: "qa-origin-rv-a",
        row: "qa-origin-rvr-a",
        name: "Origin A",
      });
      const vB = await publishRoutine(storage, author, {
        routine: "qa-origin-b",
        draftVersion: "qa-origin-rv-b",
        row: "qa-origin-rvr-b",
        name: "Origin B",
      });
      const programs = new ProgramsRepository(storage);
      const scratch = await programs.create({
        id: id("prog-set-origin"),
        createdBy: author,
        createdAt: TS,
      });
      await expect(
        programs.setRoutineOrigin(scratch.id, {
          routineId: id("qa-origin-a"),
          routineVersionId: vB.id,
          usedAs: "tweaked",
        }),
      ).rejects.toThrow("routineVersionId belongs to a different routine");
    } finally {
      storage.close();
    }
  });

  it("rejects saveFrozenCopy when routine id and version id disagree and stores pinned version number from the row", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const saver = await seedPractitioner(
        storage,
        id("qa-saver"),
        "saver@example.com",
      );
      await seedApprovedExerciseVersion(storage, author);
      const vA = await publishRoutine(storage, author, {
        routine: "qa-copy-a",
        draftVersion: "qa-copy-rv-a",
        row: "qa-copy-rvr-a",
        name: "Copy A",
      });
      const vB = await publishRoutine(storage, author, {
        routine: "qa-copy-b",
        draftVersion: "qa-copy-rv-b",
        row: "qa-copy-rvr-b",
        name: "Copy B",
      });
      const my = new PractitionerRoutinesRepository(storage);
      const rowPayload = [
        {
          id: id("qa-copy-row"),
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching" as const,
          params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        },
      ];
      await expect(
        my.saveFrozenCopy({
          id: id("qa-pr-copy-bad"),
          practitionerId: saver,
          routineId: id("qa-copy-a"),
          sourceRoutineVersionId: vB.id,
          savedAt: TS,
          rows: rowPayload,
        }),
      ).rejects.toThrow("sourceRoutineVersionId belongs to a different routine");

      const saved = await my.saveFrozenCopy({
        id: id("qa-pr-copy-ok"),
        practitionerId: saver,
        routineId: id("qa-copy-a"),
        sourceRoutineVersionId: vA.id,
        savedAt: TS,
        rows: rowPayload,
      });
      expect(saved.source_version_number).toBe(1);
      expect(saved.source_routine_version_id).toBe(vA.id);
    } finally {
      storage.close();
    }
  });

  it("rejects saveFrozenCopy of an unpublished draft and does not expose the draft to other practitioners", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("qa-author"),
        "author@example.com",
      );
      const other = await seedPractitioner(
        storage,
        id("qa-other"),
        "other@example.com",
      );
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("qa-leak-draft"),
        draftVersionId: id("qa-leak-draft-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await new RoutineVersionRowsRepository(storage).replaceDraftRow({
        id: id("qa-leak-row"),
        routineId: id("qa-leak-draft"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      const my = new PractitionerRoutinesRepository(storage);
      await expect(
        my.saveFrozenCopy({
          id: id("qa-leak-copy"),
          practitionerId: other,
          routineId: id("qa-leak-draft"),
          sourceRoutineVersionId: id("qa-leak-draft-ver"),
          savedAt: TS,
          rows: [
            {
              id: id("qa-leak-copy-row"),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        }),
      ).rejects.toThrow("sourceRoutineVersionId must be a published routine version");
      expect(await my.findForPractitioner(other, id("qa-leak-draft"))).toBeNull();
      expect(
        await routines.findVisibleToPractitioner(id("qa-leak-draft"), other),
      ).toBeNull();
      expect(await routines.listPublishedCommunity()).toHaveLength(0);
    } finally {
      storage.close();
    }
  });
});

describe("QA round 1: repository guard coverage (patient detail and author-only)", () => {
  it("rejects patient details on who-it-is-for and name at draft create", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routines = new RoutinesRepository(storage);
      await expect(
        routines.createDraft({
          id: id("qa-pii-create-who"),
          draftVersionId: id("qa-pii-create-who-ver"),
          createdBy: author,
          createdAt: TS,
          bodyRegionId: BODY_REGION_KNEE,
          whoItsFor: `Notes for patient@example.com`,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      await expect(
        routines.createDraft({
          id: id("qa-pii-create-name"),
          draftVersionId: id("qa-pii-create-name-ver"),
          createdBy: author,
          createdAt: TS,
          bodyRegionId: BODY_REGION_KNEE,
          name: `Plan ${FAKE_DOB_SNIPPET}`,
        }),
      ).rejects.toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });

  it("rejects patient details on draft name edit", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routines = new RoutinesRepository(storage);
      await routines.createDraft({
        id: id("qa-pii-edit-name"),
        draftVersionId: id("qa-pii-edit-name-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await expect(
        routines.updateDraftMetadata({
          routineId: id("qa-pii-edit-name"),
          authorId: author,
          draftUpdatedAt: TS,
          name: `Bad ${FAKE_DOB_SNIPPET}`,
        }),
      ).rejects.toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });

  it("rejects patient details on savePublishedVersion name and change summary", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const v1 = await publishRoutine(storage, author, {
        routine: "qa-save-pii",
        draftVersion: "qa-save-pii-rv",
        row: "qa-save-pii-rvr",
        name: "Safe name",
      });
      const versions = new RoutineVersionsRepository(storage);
      await expect(
        versions.savePublishedVersion({
          id: id("qa-save-pii-v2-name"),
          routineId: id("qa-save-pii"),
          createdBy: author,
          createdAt: TS,
          name: `Bad patient@example.com`,
          copyFromVersionId: v1.id,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      await expect(
        versions.savePublishedVersion({
          id: id("qa-save-pii-v2-summary"),
          routineId: id("qa-save-pii"),
          createdBy: author,
          createdAt: TS,
          name: "Still safe",
          changeSummary: `Changed for ${FAKE_DOB_SNIPPET}`,
          copyFromVersionId: v1.id,
        }),
      ).rejects.toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });

  it("rejects draft metadata edit, publish, and row edit by non-authors", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage, id("qa-own"), "own@example.com");
      const other = await seedPractitioner(
        storage,
        id("qa-not-own"),
        "notown@example.com",
      );
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      await routines.createDraft({
        id: id("qa-author-draft"),
        draftVersionId: id("qa-author-draft-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await expect(
        routines.updateDraftMetadata({
          routineId: id("qa-author-draft"),
          authorId: other,
          draftUpdatedAt: TS,
          name: "Stolen edit",
        }),
      ).rejects.toThrow("Only the author can edit this draft");
      await expect(
        versions.publishDraft({
          routineId: id("qa-author-draft"),
          authorId: other,
          publishedAt: TS,
          name: "Stolen publish",
        }),
      ).rejects.toThrow("Only the author can publish this draft");
      await expect(
        rows.replaceDraftRow({
          id: id("qa-author-row"),
          routineId: id("qa-author-draft"),
          authorId: other,
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow("Only the author can edit draft rows");
    } finally {
      storage.close();
    }
  });
});

describe("QA round 1: remaining repository guards", () => {
  it("rejects unknown routine version ids when pinning program origin or saved copies", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const v1 = await publishRoutine(storage, author, {
        routine: "qa-missing-ver",
        draftVersion: "qa-missing-ver-rv",
        row: "qa-missing-ver-rvr",
        name: "Missing ver routine",
      });
      const missingVersionId = id("qa-no-such-version");
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.create({
          id: id("prog-missing-ver"),
          createdBy: author,
          createdAt: TS,
          routineOrigin: {
            routineId: id("qa-missing-ver"),
            routineVersionId: missingVersionId,
            origin: "used_as_is",
          },
        }),
      ).rejects.toThrow("Source routine version not found");

      const my = new PractitionerRoutinesRepository(storage);
      await expect(
        my.saveFrozenCopy({
          id: id("qa-missing-copy"),
          practitionerId: author,
          routineId: id("qa-missing-ver"),
          sourceRoutineVersionId: missingVersionId,
          savedAt: TS,
          rows: [
            {
              id: id("qa-missing-copy-row"),
              position: 0,
              exerciseId: FIXTURE_EXERCISE_ID,
              exerciseVersionId: FIXTURE_VERSION_ID,
              prescriptionType: "stretching",
              params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        }),
      ).rejects.toThrow("Source routine version not found");
      expect(v1.id).toBeDefined();
    } finally {
      storage.close();
    }
  });

  it("rejects empty body region on draft create and draft metadata on published routines", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      const routines = new RoutinesRepository(storage);
      await expect(
        routines.createDraft({
          id: id("qa-empty-region"),
          draftVersionId: id("qa-empty-region-ver"),
          createdBy: author,
          createdAt: TS,
          bodyRegionId: "   ",
        }),
      ).rejects.toThrow("Body region id must not be empty");

      await seedApprovedExerciseVersion(storage, author);
      await publishRoutine(storage, author, {
        routine: "qa-published-meta",
        draftVersion: "qa-published-meta-rv",
        row: "qa-published-meta-rvr",
        name: "Published meta",
      });
      await expect(
        routines.updateDraftMetadata({
          routineId: id("qa-published-meta"),
          authorId: author,
          draftUpdatedAt: TS,
          whoItsFor: "General adults",
        }),
      ).rejects.toThrow("Published routines use version saves, not draft metadata");
    } finally {
      storage.close();
    }
  });

  it("rejects double publish, version save on draft-only routines, and draft row edits on published routines", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const rows = new RoutineVersionRowsRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const v1 = await publishRoutine(storage, author, {
        routine: "qa-double-pub",
        draftVersion: "qa-double-pub-rv",
        row: "qa-double-pub-rvr",
        name: "Double publish",
      });
      await expect(
        versions.publishDraft({
          routineId: id("qa-double-pub"),
          authorId: author,
          publishedAt: TS,
          name: "Again",
        }),
      ).rejects.toThrow("Routine is already published");

      await routines.createDraft({
        id: id("qa-draft-only-save"),
        draftVersionId: id("qa-draft-only-save-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await rows.replaceDraftRow({
        id: id("qa-draft-only-save-row"),
        routineId: id("qa-draft-only-save"),
        authorId: author,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
        draftUpdatedAt: TS,
      });
      await expect(
        versions.savePublishedVersion({
          id: id("qa-draft-only-save-v2"),
          routineId: id("qa-draft-only-save"),
          createdBy: author,
          createdAt: TS,
          name: "Should fail",
          copyFromVersionId: id("qa-draft-only-save-ver"),
        }),
      ).rejects.toThrow("Routine is not published");

      await expect(
        rows.replaceDraftRow({
          id: id("qa-live-row-edit"),
          routineId: id("qa-double-pub"),
          authorId: author,
          position: 0,
          exerciseId: FIXTURE_EXERCISE_ID,
          exerciseVersionId: FIXTURE_VERSION_ID,
          prescriptionType: "stretching",
          params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow("Use published version saves for live routines");
      expect(v1.id).toBeDefined();
    } finally {
      storage.close();
    }
  });

  it("rejects partial program routine origin trios", () => {
    expect(() =>
      validateProgramRoutineOriginTrio({
        sourceRoutineId: id("qa-trio-routine"),
        sourceRoutineVersionId: null,
        sourceRoutineOrigin: "used_as_is",
      }),
    ).toThrow(RoutineRepositoryError);
  });
});

describe("QA round 1: empty routine guards and published name CHECK", () => {
  it("rejects publish without exercises and saveFrozenCopy without rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);
      const routines = new RoutinesRepository(storage);
      const versions = new RoutineVersionsRepository(storage);
      const my = new PractitionerRoutinesRepository(storage);
      await routines.createDraft({
        id: id("qa-empty-publish"),
        draftVersionId: id("qa-empty-publish-ver"),
        createdBy: author,
        createdAt: TS,
        bodyRegionId: BODY_REGION_KNEE,
      });
      await expect(
        versions.publishDraft({
          routineId: id("qa-empty-publish"),
          authorId: author,
          publishedAt: TS,
          name: "Empty routine",
        }),
      ).rejects.toThrow("Add at least one exercise before publish");

      const v1 = await publishRoutine(storage, author, {
        routine: "qa-empty-copy",
        draftVersion: "qa-empty-copy-rv",
        row: "qa-empty-copy-rvr",
        name: "Has row",
      });
      await expect(
        my.saveFrozenCopy({
          id: id("qa-empty-copy-id"),
          practitionerId: author,
          routineId: id("qa-empty-copy"),
          sourceRoutineVersionId: v1.id,
          savedAt: TS,
          rows: [],
        }),
      ).rejects.toThrow("Cannot save an empty routine copy");

      const vEmpty = await publishRoutine(storage, author, {
        routine: "qa-empty-version",
        draftVersion: "qa-empty-version-rv",
        row: "qa-empty-version-rvr",
        name: "Row then delete",
      });
      await storage.run(
        `DELETE FROM routine_version_rows WHERE routine_version_id = ?`,
        [vEmpty.id],
      );
      await expect(
        new RoutineVersionsRepository(storage).savePublishedVersion({
          id: id("qa-empty-version-next"),
          routineId: id("qa-empty-version"),
          createdBy: author,
          createdAt: TS,
          name: "Next version",
          copyFromVersionId: vEmpty.id,
        }),
      ).rejects.toThrow("Cannot save an empty routine version");
    } finally {
      storage.close();
    }
  });

  it("schema CHECK requires a non-empty name on published routine versions", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await storage.run(
        `INSERT INTO routines (
          id, created_by, created_at, condition_id, body_region_id, who_its_for,
          published_version, draft_updated_at
        ) VALUES (?, ?, ?, NULL, ?, NULL, 1, ?)`,
        [id("qa-check-routine"), author, TS, BODY_REGION_KNEE, TS],
      );
      await expect(
        storage.run(
          `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 1, 'published', NULL, NULL, NULL, ?, ?)`,
          [id("qa-check-bad-name"), id("qa-check-routine"), author, TS],
        ),
      ).rejects.toThrow(/CHECK constraint failed/i);
    } finally {
      storage.close();
    }
  });
});
