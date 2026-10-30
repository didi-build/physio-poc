import { describe, expect, it } from "vitest";
import { parseProgramRowTextSnapshotJson } from "../src/domain/program-types.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";

const POSITIVE_INTEGER_MESSAGE =
  "text_snapshot_json.libraryUpdateDismissedVersionNumber must be a positive integer";

describe("parseProgramRowTextSnapshotJson libraryUpdateDismissedVersionNumber (M11)", () => {
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["non-integer", 1.5],
  ])("rejects %s", (_label, value) => {
    expect(() =>
      parseProgramRowTextSnapshotJson(
        JSON.stringify({
          title: "Heel slide",
          libraryUpdateDismissedVersionNumber: value,
        }),
      ),
    ).toThrow(POSITIVE_INTEGER_MESSAGE);
  });

  it('rejects string "2"', () => {
    expect(() =>
      parseProgramRowTextSnapshotJson(
        JSON.stringify({
          title: "Heel slide",
          libraryUpdateDismissedVersionNumber: "2",
        }),
      ),
    ).toThrow(POSITIVE_INTEGER_MESSAGE);
  });

  it("accepts 1", () => {
    expect(
      parseProgramRowTextSnapshotJson(
        JSON.stringify({
          title: "Heel slide",
          libraryUpdateDismissedVersionNumber: 1,
        }),
      ),
    ).toEqual({
      title: "Heel slide",
      libraryUpdateDismissedVersionNumber: 1,
    });
  });

  it("rejects zero in stored row JSON via getProgram", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `UPDATE exercise_versions SET status = 'approved', approved_by = ?, approved_at = ? WHERE id = ?`,
        [practitionerId, TS, FIXTURE_VERSION_ID],
      );
      const service = new ProgramBuilderService(storage);
      await service.createProgram(practitionerId, { programId: id("prog-parse-zero") });
      await service.addExerciseRow(practitionerId, id("prog-parse-zero"), {
        rowId: id("row-parse-zero"),
        exerciseId: FIXTURE_EXERCISE_ID,
      });
      await storage.run(`UPDATE program_rows SET text_snapshot_json = ? WHERE id = ?`, [
        JSON.stringify({
          title: "Heel slide",
          libraryUpdateDismissedVersionNumber: 0,
        }),
        id("row-parse-zero"),
      ]);
      await expect(
        service.getProgram(practitionerId, id("prog-parse-zero")),
      ).rejects.toMatchObject({
        code: "invalid_input",
        message: POSITIVE_INTEGER_MESSAGE,
      });
    } finally {
      storage.close();
    }
  });
});
