import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./exercise-sqlite-fixture.js";
import {
  RoutineVersionRowsRepository,
  RoutinesRepository,
  RoutineVersionsRepository,
} from "../../src/storage/repositories/routines.js";
import { id } from "./opaque-test-ids.js";

const BODY_REGION_KNEE = "br-knee";

export type PublishRoutineSeeds = {
  routine: string;
  draftVersion: string;
  row: string;
  name: string;
  hold_s?: number;
  secondRow?: string;
};

export async function seedApprovedExerciseForBuilder(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<void> {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await storage.run(
    `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
    [practitionerId, TS, FIXTURE_VERSION_ID],
  );
}

export async function seedTwoPractitioners(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
): Promise<{ practitionerA: string; practitionerB: string }> {
  const practitionerA = await seedPractitioner(storage, id("pract-a"), "a@example.com");
  const practitionerB = await seedPractitioner(storage, id("pract-b"), "b@example.com");
  await seedApprovedExerciseForBuilder(storage, practitionerA);
  return { practitionerA, practitionerB };
}

export async function publishRoutine(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  seeds: PublishRoutineSeeds,
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
  await rows.replaceDraftRow({
    id: id(seeds.row),
    routineId: id(seeds.routine),
    authorId: author,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: {
      hold_s: seeds.hold_s ?? 30,
      per_day: { min: 1, max: 2 },
      days_per_week: 7,
    },
    draftUpdatedAt: TS,
  });
  if (seeds.secondRow) {
    await rows.replaceDraftRow({
      id: id(seeds.secondRow),
      routineId: id(seeds.routine),
      authorId: author,
      position: 1,
      exerciseId: FIXTURE_EXERCISE_ID,
      exerciseVersionId: FIXTURE_VERSION_ID,
      prescriptionType: "stretching",
      params: {
        hold_s: seeds.hold_s ?? 30,
        per_day: { min: 1, max: 2 },
        days_per_week: 7,
      },
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

export async function deleteRoutineRecord(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  routineId: string,
): Promise<void> {
  const rid = id(routineId);
  await storage.run(
    `DELETE FROM practitioner_routine_rows WHERE practitioner_routine_id IN (
      SELECT id FROM practitioner_routines WHERE routine_id = ?
    )`,
    [rid],
  );
  await storage.run(`DELETE FROM practitioner_routines WHERE routine_id = ?`, [rid]);
  await storage.run(
    `DELETE FROM routine_version_rows WHERE routine_version_id IN (
      SELECT id FROM routine_versions WHERE routine_id = ?
    )`,
    [rid],
  );
  await storage.run(`DELETE FROM routine_versions WHERE routine_id = ?`, [rid]);
  await storage.run(`DELETE FROM routines WHERE id = ?`, [rid]);
}
