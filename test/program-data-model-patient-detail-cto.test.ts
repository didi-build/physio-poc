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
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

const FLAGGED = "coach@example.com";

const rowInput = {
  exerciseId: "ex-1",
  exerciseVersionId: "ver-1",
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
          id: "prog-name-create",
          createdBy: practitionerId,
          createdAt: TS,
          name: FLAGGED,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      expect(await programs.findById("prog-name-create")).toBeNull();
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
        id: "prog-name-update",
        createdBy: practitionerId,
        createdAt: TS,
        name: "Shoulder mobility",
      });
      await expect(
        programs.updateDraftName("prog-name-update", FLAGGED),
      ).rejects.toThrow(FreeTextValidationError);
      expect((await programs.findById("prog-name-update"))?.name).toBe(
        "Shoulder mobility",
      );
    } finally {
      storage.close();
    }
  });

  it("rejects flagged published_name on publish and leaves published_name unchanged", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: "prog-published-name",
        createdBy: practitionerId,
        createdAt: TS,
        name: "Published clean",
      });
      await rows.replaceRow({
        id: "row-1",
        programId: "prog-published-name",
        position: 0,
        ...rowInput,
      });
      await programs.publish("prog-published-name", TS);
      const before = await storage.first<{ published_name: string | null }>(
        "SELECT published_name FROM programs WHERE id = ? LIMIT 1",
        ["prog-published-name"],
      );
      expect(before?.published_name).toBe("Published clean");
      await storage.run(`UPDATE programs SET name = ? WHERE id = ?`, [
        FLAGGED,
        "prog-published-name",
      ]);
      await expect(programs.publish("prog-published-name", TS)).rejects.toThrow(
        FreeTextValidationError,
      );
      const after = await storage.first<{ published_name: string | null }>(
        "SELECT published_name FROM programs WHERE id = ? LIMIT 1",
        ["prog-published-name"],
      );
      expect(after?.published_name).toBe("Published clean");
    } finally {
      storage.close();
    }
  });

  it("rejects flagged program_rows.note on replaceRow and stores no note", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: "prog-row-note",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        rows.replaceRow({
          id: "row-note",
          programId: "prog-row-note",
          position: 0,
          ...rowInput,
          note: FLAGGED,
        }),
      ).rejects.toThrow(FreeTextValidationError);
      const stored = await storage.first<{ note: string | null }>(
        "SELECT note FROM program_rows WHERE id = ? LIMIT 1",
        ["row-note"],
      );
      expect(stored).toBeNull();
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
        id: "prog-snapshot",
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
        id: "row-snap",
        programId: "prog-snapshot",
        position: 0,
        ...rowInput,
        textSnapshot: rawSnapshot,
      });
      const rowJson = await storage.first<{ text_snapshot_json: string }>(
        "SELECT text_snapshot_json FROM program_rows WHERE id = ? LIMIT 1",
        ["row-snap"],
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
        "row-snap",
      ]);
      await expect(programs.publish("prog-snapshot", TS)).rejects.toThrow(
        FreeTextValidationError,
      );
      await storage.run(`UPDATE program_rows SET text_snapshot_json = ? WHERE id = ?`, [
        JSON.stringify({
          title: "Heel slide",
          description: "Hold steady",
          cue: "Slow",
        }),
        "row-snap",
      ]);
      await programs.publish("prog-snapshot", TS);
      const program = await programs.findById("prog-snapshot");
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
