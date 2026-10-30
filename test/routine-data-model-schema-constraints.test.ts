import { describe, expect, it } from "vitest";
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
const VALID_PARAMS = JSON.stringify({
  hold_s: 30,
  per_day: { min: 1, max: 2 },
  days_per_week: 7,
});

async function expectConstraintViolation(
  fn: () => Promise<unknown>,
  messagePattern: RegExp,
): Promise<void> {
  await expect(fn()).rejects.toThrow(messagePattern);
}

async function seedPublishedRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  routineKey: string,
) {
  const routineId = id(routineKey);
  const versionId = id(`${routineKey}-v1`);
  await storage.run(
    `INSERT INTO routines (
      id, created_by, created_at, condition_id, body_region_id, who_its_for,
      published_version, draft_updated_at
    ) VALUES (?, ?, ?, NULL, ?, NULL, 1, ?)`,
    [routineId, author, TS, BODY_REGION_KNEE, TS],
  );
  await storage.run(
    `INSERT INTO routine_versions (
      id, routine_id, version_number, status, name, change_summary,
      restored_from_version_id, created_by, created_at
    ) VALUES (?, ?, 1, 'published', ?, NULL, NULL, ?, ?)`,
    [versionId, routineId, "Published routine", author, TS],
  );
  await storage.run(
    `INSERT INTO routine_version_rows (
      id, routine_version_id, position, exercise_id, exercise_version_id,
      prescription_type, params_json
    ) VALUES (?, ?, 0, ?, ?, 'stretching', ?)`,
    [
      id(`${routineKey}-row`),
      versionId,
      FIXTURE_EXERCISE_ID,
      FIXTURE_VERSION_ID,
      VALID_PARAMS,
    ],
  );
  return { routineId, versionId };
}

describe("migration 0005 schema constraints (direct SQL, SQLite)", () => {
  it("rejects violating rows for conditions, routines, versions, rows, and practitioner copies", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, author);

      await storage.run(
        "INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, ?)",
        [id("cond-a"), "Knee OA", 0],
      );
      await expectConstraintViolation(
        () =>
          storage.run(
            "INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, ?)",
            [id("cond-dup-label"), "Knee OA", 1],
          ),
        /UNIQUE constraint failed: conditions\.label/i,
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            "INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, ?)",
            [id("cond-bad-sort"), "Shoulder", -1],
          ),
        /CHECK constraint failed: sort_order >= 0/i,
      );

      const routineDraftId = id("schema-routine-draft");
      await storage.run(
        `INSERT INTO routines (
          id, created_by, created_at, condition_id, body_region_id, who_its_for,
          published_version, draft_updated_at
        ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?)`,
        [routineDraftId, author, TS, BODY_REGION_KNEE, TS],
      );
      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO routines (
            id, created_by, created_at, condition_id, body_region_id, who_its_for,
            published_version, draft_updated_at
          ) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)`,
            [id("schema-routine-bad-pub"), author, TS, BODY_REGION_KNEE, 0, TS],
          ),
        /CHECK constraint failed: published_version IS NULL OR published_version >= 1/i,
      );

      await storage.run(
        `INSERT INTO routine_versions (
          id, routine_id, version_number, status, name, change_summary,
          restored_from_version_id, created_by, created_at
        ) VALUES (?, ?, 0, 'draft', NULL, NULL, NULL, ?, ?)`,
        [id("schema-rv-draft"), routineDraftId, author, TS],
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 0, 'mutated', NULL, NULL, NULL, ?, ?)`,
            [id("schema-rv-bad-status"), routineDraftId, author, TS],
          ),
        /CHECK constraint failed: status IN \('draft', 'published'\)/i,
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 1, 'draft', NULL, NULL, NULL, ?, ?)`,
            [id("schema-rv-draft-wrong-num"), routineDraftId, author, TS],
          ),
        /CHECK constraint failed: \(status = 'draft' AND version_number = 0\)/i,
      );

      const { routineId: pubRoutineId } = await seedPublishedRoutine(
        storage,
        author,
        "schema-pub-routine",
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 0, 'published', 'Bad', NULL, NULL, ?, ?)`,
            [id("schema-pub-v0"), pubRoutineId, author, TS],
          ),
        /CHECK constraint failed: \(status = 'draft' AND version_number = 0\)/i,
      );

      const blankNameRoutineId = id("schema-blank-name-routine");
      await storage.run(
        `INSERT INTO routines (
          id, created_by, created_at, condition_id, body_region_id, who_its_for,
          published_version, draft_updated_at
        ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?)`,
        [blankNameRoutineId, author, TS, BODY_REGION_KNEE, TS],
      );
      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 1, 'published', ?, NULL, NULL, ?, ?)`,
            [id("schema-pub-blank-name"), blankNameRoutineId, "   ", author, TS],
          ),
        /length\(trim\(name\)\) >= 1/i,
      );

      const draftVersionId = id("schema-rv-draft");
      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO routine_version_rows (
            id, routine_version_id, position, exercise_id, exercise_version_id,
            prescription_type, params_json
          ) VALUES (?, ?, ?, ?, ?, 'stretching', ?)`,
            [
              id("schema-rvr-bad-pos"),
              draftVersionId,
              -1,
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              VALID_PARAMS,
            ],
          ),
        /CHECK constraint failed: position >= 0/i,
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO routine_version_rows (
            id, routine_version_id, position, exercise_id, exercise_version_id,
            prescription_type, params_json
          ) VALUES (?, ?, 0, ?, ?, ?, ?)`,
            [
              id("schema-rvr-bad-type"),
              draftVersionId,
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              "cardio",
              VALID_PARAMS,
            ],
          ),
        /CHECK constraint failed: prescription_type IN/i,
      );

      const { routineId, versionId } = await seedPublishedRoutine(
        storage,
        author,
        "schema-pr-routine",
      );

      await storage.run(
        `INSERT INTO practitioner_routines (
          id, practitioner_id, routine_id, source_routine_version_id,
          source_version_number, saved_at, last_used_at, edited
        ) VALUES (?, ?, ?, ?, 1, ?, NULL, 0)`,
        [id("schema-pr-copy"), author, routineId, versionId, TS],
      );

      const saverForSrcVer = await seedPractitioner(
        storage,
        id("schema-pr-saver-src-ver"),
        "src-ver@example.com",
      );
      const { routineId: routineSrcVer, versionId: versionSrcVer } =
        await seedPublishedRoutine(storage, author, "schema-pr-routine-src-ver");
      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO practitioner_routines (
            id, practitioner_id, routine_id, source_routine_version_id,
            source_version_number, saved_at, last_used_at, edited
          ) VALUES (?, ?, ?, ?, 0, ?, NULL, 0)`,
            [
              id("schema-pr-bad-src-ver"),
              saverForSrcVer,
              routineSrcVer,
              versionSrcVer,
              TS,
            ],
          ),
        /CHECK constraint failed: source_version_number >= 1/i,
      );

      const saverForEdited = await seedPractitioner(
        storage,
        id("schema-pr-saver-edited"),
        "edited@example.com",
      );
      const { routineId: routineEdited, versionId: versionEdited } =
        await seedPublishedRoutine(storage, author, "schema-pr-routine-edited");
      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO practitioner_routines (
            id, practitioner_id, routine_id, source_routine_version_id,
            source_version_number, saved_at, last_used_at, edited
          ) VALUES (?, ?, ?, ?, 1, ?, NULL, 2)`,
            [
              id("schema-pr-bad-edited"),
              saverForEdited,
              routineEdited,
              versionEdited,
              TS,
            ],
          ),
        /CHECK constraint failed: edited IN \(0, 1\)/i,
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO practitioner_routines (
            id, practitioner_id, routine_id, source_routine_version_id,
            source_version_number, saved_at, last_used_at, edited
          ) VALUES (?, ?, ?, ?, 1, ?, NULL, 0)`,
            [id("schema-pr-dup"), author, routineId, versionId, TS],
          ),
        /UNIQUE constraint failed: practitioner_routines\.practitioner_id, practitioner_routines\.routine_id/i,
      );

      const copyId = id("schema-pr-copy");
      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO practitioner_routine_rows (
            id, practitioner_routine_id, position, exercise_id, exercise_version_id,
            prescription_type, params_json
          ) VALUES (?, ?, ?, ?, ?, 'stretching', ?)`,
            [
              id("schema-prr-bad-pos"),
              copyId,
              -1,
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              VALID_PARAMS,
            ],
          ),
        /CHECK constraint failed: position >= 0/i,
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO practitioner_routine_rows (
            id, practitioner_routine_id, position, exercise_id, exercise_version_id,
            prescription_type, params_json
          ) VALUES (?, ?, 0, ?, ?, ?, ?)`,
            [
              id("schema-prr-bad-type"),
              copyId,
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              "cardio",
              VALID_PARAMS,
            ],
          ),
        /CHECK constraint failed: prescription_type IN/i,
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO practitioner_routine_rows (
            id, practitioner_routine_id, position, exercise_id, exercise_version_id,
            prescription_type, params_json
          ) VALUES (?, ?, 0, ?, ?, 'stretching', ?)`,
            [
              id("schema-prr-bad-json"),
              copyId,
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              "not-json",
            ],
          ),
        /CHECK constraint failed: json_valid\(params_json\)/i,
      );

      await storage.run(
        `INSERT INTO practitioner_routine_rows (
          id, practitioner_routine_id, position, exercise_id, exercise_version_id,
          prescription_type, params_json
        ) VALUES (?, ?, 0, ?, ?, 'stretching', ?)`,
        [
          id("schema-prr-pos0"),
          copyId,
          FIXTURE_EXERCISE_ID,
          FIXTURE_VERSION_ID,
          VALID_PARAMS,
        ],
      );

      await expectConstraintViolation(
        () =>
          storage.run(
            `INSERT INTO practitioner_routine_rows (
            id, practitioner_routine_id, position, exercise_id, exercise_version_id,
            prescription_type, params_json
          ) VALUES (?, ?, 0, ?, ?, 'stretching', ?)`,
            [
              id("schema-prr-dup-pos"),
              copyId,
              FIXTURE_EXERCISE_ID,
              FIXTURE_VERSION_ID,
              VALID_PARAMS,
            ],
          ),
        /UNIQUE constraint failed: practitioner_routine_rows\.practitioner_routine_id, practitioner_routine_rows\.position/i,
      );
    } finally {
      storage.close();
    }
  });
});
