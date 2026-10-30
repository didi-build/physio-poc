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

async function expectConstraintViolation(fn: () => Promise<unknown>): Promise<void> {
  await expect(fn()).rejects.toThrow(
    /CHECK constraint failed|UNIQUE constraint failed/i,
  );
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
      await expectConstraintViolation(() =>
        storage.run("INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, ?)", [
          id("cond-dup-label"),
          "Knee OA",
          1,
        ]),
      );

      await expectConstraintViolation(() =>
        storage.run("INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, ?)", [
          id("cond-bad-sort"),
          "Shoulder",
          -1,
        ]),
      );

      const routineDraftId = id("schema-routine-draft");
      await storage.run(
        `INSERT INTO routines (
          id, created_by, created_at, condition_id, body_region_id, who_its_for,
          published_version, draft_updated_at
        ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?)`,
        [routineDraftId, author, TS, BODY_REGION_KNEE, TS],
      );
      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO routines (
            id, created_by, created_at, condition_id, body_region_id, who_its_for,
            published_version, draft_updated_at
          ) VALUES (?, ?, ?, NULL, ?, NULL, ?, ?)`,
          [id("schema-routine-bad-pub"), author, TS, BODY_REGION_KNEE, 0, TS],
        ),
      );

      await storage.run(
        `INSERT INTO routine_versions (
          id, routine_id, version_number, status, name, change_summary,
          restored_from_version_id, created_by, created_at
        ) VALUES (?, ?, 0, 'draft', NULL, NULL, NULL, ?, ?)`,
        [id("schema-rv-draft"), routineDraftId, author, TS],
      );

      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 0, 'mutated', NULL, NULL, NULL, ?, ?)`,
          [id("schema-rv-bad-status"), routineDraftId, author, TS],
        ),
      );

      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 1, 'draft', NULL, NULL, NULL, ?, ?)`,
          [id("schema-rv-draft-wrong-num"), routineDraftId, author, TS],
        ),
      );

      const { routineId: pubRoutineId } = await seedPublishedRoutine(
        storage,
        author,
        "schema-pub-routine",
      );

      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 0, 'published', 'Bad', NULL, NULL, ?, ?)`,
          [id("schema-pub-v0"), pubRoutineId, author, TS],
        ),
      );

      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO routine_versions (
            id, routine_id, version_number, status, name, change_summary,
            restored_from_version_id, created_by, created_at
          ) VALUES (?, ?, 1, 'published', ?, NULL, NULL, ?, ?)`,
          [id("schema-pub-blank-name"), pubRoutineId, "   ", author, TS],
        ),
      );

      const draftVersionId = id("schema-rv-draft");
      await expectConstraintViolation(() =>
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
      );

      await expectConstraintViolation(() =>
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

      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO practitioner_routines (
            id, practitioner_id, routine_id, source_routine_version_id,
            source_version_number, saved_at, last_used_at, edited
          ) VALUES (?, ?, ?, ?, 0, ?, NULL, 0)`,
          [id("schema-pr-bad-src-ver"), author, routineId, versionId, TS],
        ),
      );

      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO practitioner_routines (
            id, practitioner_id, routine_id, source_routine_version_id,
            source_version_number, saved_at, last_used_at, edited
          ) VALUES (?, ?, ?, ?, 1, ?, NULL, 2)`,
          [id("schema-pr-bad-edited"), author, routineId, versionId, TS],
        ),
      );

      await expectConstraintViolation(() =>
        storage.run(
          `INSERT INTO practitioner_routines (
            id, practitioner_id, routine_id, source_routine_version_id,
            source_version_number, saved_at, last_used_at, edited
          ) VALUES (?, ?, ?, ?, 1, ?, NULL, 0)`,
          [id("schema-pr-dup"), author, routineId, versionId, TS],
        ),
      );

      const copyId = id("schema-pr-copy");
      await expectConstraintViolation(() =>
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
      );

      await expectConstraintViolation(() =>
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
      );

      await expectConstraintViolation(() =>
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

      await expectConstraintViolation(() =>
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
      );
    } finally {
      storage.close();
    }
  });
});
