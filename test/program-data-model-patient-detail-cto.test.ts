import { describe, expect, it } from "vitest";
import { FreeTextValidationError } from "../src/domain/exercise-free-text.js";
import {
  parsePublishedProgramSnapshotJson,
  type ProgramRowTextSnapshot,
} from "../src/domain/program-types.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const FLAGGED = "coach@example.com";

const rowInput = {
  exerciseId: FIXTURE_EXERCISE_ID,
  exerciseVersionId: FIXTURE_VERSION_ID,
  prescriptionType: "stretching" as const,
  params: { hold_s: 30 },
  textSnapshot: { title: "Heel slide" },
  draftUpdatedAt: TS,
};

describe("DIDI-1000 CTO patient-detail enforcement", () => {
  it("rejects flagged programs.name on create and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.create({
          id: id("prog-name-create"),
          createdBy: practitionerId,
          createdAt: TS,
          name: FLAGGED,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      expect(await programs.findById(id("prog-name-create"))).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects flagged programs.name on updateDraftName and leaves the prior name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await programs.create({
        id: id("prog-name-update"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Shoulder mobility",
      });
      await expect(
        programs.updateDraftName(id("prog-name-update"), FLAGGED),
      ).rejects.toThrow(FreeTextValidationError);
      expect((await programs.findById(id("prog-name-update")))?.name).toBe(
        "Shoulder mobility",
      );
    } finally {
      storage.close();
    }
  });

  it("QA: replaceRow rejects patient details in program_rows.note and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-qa-note"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        rows.replaceRow({
          id: id("row-qa-note"),
          programId: id("prog-qa-note"),
          position: 0,
          ...rowInput,
          note: FLAGGED,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM program_rows WHERE program_id = ? LIMIT 1",
          [id("prog-qa-note")],
        ),
      ).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("QA: published_name stays frozen after draft row edit and rename; publish rejects DB flagged name", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-qa-published"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "Published name",
      });
      await rows.replaceRow({
        id: id("row-1"),
        programId: id("prog-qa-published"),
        position: 0,
        ...rowInput,
      });
      await programs.publish(id("prog-qa-published"), TS);
      await rows.replaceRow({
        id: id("row-1"),
        programId: id("prog-qa-published"),
        position: 0,
        ...rowInput,
        textSnapshot: { title: "Updated heel slide" },
        draftUpdatedAt: TS,
      });
      await programs.updateDraftName(id("prog-qa-published"), "Renamed draft only");
      const frozen = await storage.first<{
        published_name: string | null;
        name: string | null;
      }>("SELECT published_name, name FROM programs WHERE id = ? LIMIT 1", [
        id("prog-qa-published"),
      ]);
      expect(frozen?.published_name).toBe("Published name");
      expect(frozen?.name).toBe("Renamed draft only");
      await storage.run(`UPDATE programs SET name = ? WHERE id = ?`, [
        FLAGGED,
        id("prog-qa-published"),
      ]);
      await expect(programs.publish(id("prog-qa-published"), TS)).rejects.toThrow(
        FreeTextValidationError,
      );
      expect(
        (
          await storage.first<{ published_name: string | null }>(
            "SELECT published_name FROM programs WHERE id = ? LIMIT 1",
            [id("prog-qa-published")],
          )
        )?.published_name,
      ).toBe("Published name");
    } finally {
      storage.close();
    }
  });

  it("QA: replaceRow rejects patient details in text snapshot cue and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-qa-cue"),
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        rows.replaceRow({
          id: id("row-qa-cue"),
          programId: id("prog-qa-cue"),
          position: 0,
          ...rowInput,
          textSnapshot: { title: "Heel slide", cue: FLAGGED },
        }),
      ).rejects.toThrow(FreeTextValidationError);
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM program_rows WHERE program_id = ? LIMIT 1",
          [id("prog-qa-cue")],
        ),
      ).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("builds published_snapshot_json only from validated row and program fields", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: id("prog-snapshot"),
        createdBy: practitionerId,
        createdAt: TS,
        name: "  Snapshot plan  ",
      });
      const rawSnapshot = {
        title: "Heel slide",
        description: "Hold steady",
        cue: "Slow",
        extraPatientField: FLAGGED,
      } as ProgramRowTextSnapshot & { extraPatientField: string };
      await rows.replaceRow({
        id: id("row-snap"),
        programId: id("prog-snapshot"),
        position: 0,
        ...rowInput,
        textSnapshot: rawSnapshot,
      });
      const rowJson = await storage.first<{ text_snapshot_json: string }>(
        "SELECT text_snapshot_json FROM program_rows WHERE id = ? LIMIT 1",
        [id("row-snap")],
      );
      expect(Object.keys(JSON.parse(rowJson?.text_snapshot_json ?? "{}"))).toEqual([
        "title",
        "description",
        "cue",
      ]);
      await storage.run(`UPDATE program_rows SET text_snapshot_json = ? WHERE id = ?`, [
        JSON.stringify({
          title: "Heel slide",
          description: FLAGGED,
        }),
        id("row-snap"),
      ]);
      await expect(programs.publish(id("prog-snapshot"), TS)).rejects.toThrow(
        FreeTextValidationError,
      );
      await storage.run(`UPDATE program_rows SET text_snapshot_json = ? WHERE id = ?`, [
        JSON.stringify({
          title: "Heel slide",
          description: "Hold steady",
          cue: "Slow",
        }),
        id("row-snap"),
      ]);
      await programs.publish(id("prog-snapshot"), TS);
      const program = await programs.findById(id("prog-snapshot"));
      const published = parsePublishedProgramSnapshotJson(
        program?.published_snapshot_json ?? "",
      );
      expect(published.name).toBe("Snapshot plan");
      expect(Object.keys(published.rows[0]?.textSnapshot ?? {})).toEqual([
        "title",
        "description",
        "cue",
      ]);
      expect(published.rows[0]?.textSnapshot.description).toBe("Hold steady");
      expect(JSON.stringify(published)).not.toContain(FLAGGED);
    } finally {
      storage.close();
    }
  });
});
