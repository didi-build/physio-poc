import { describe, expect, it } from "vitest";
import { OpaqueEntityIdValidationError } from "../src/domain/opaque-entity-id.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import {
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";

const HUMAN_READABLE_ID = "John-Smith-knee";

describe("DIDI-1000 opaque caller-supplied entity ids", () => {
  it("rejects a human-readable program id and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      await expect(
        programs.create({
          id: HUMAN_READABLE_ID,
          createdBy: practitionerId,
          createdAt: TS,
        }),
      ).rejects.toThrow(OpaqueEntityIdValidationError);
      await expect(
        programs.create({
          id: HUMAN_READABLE_ID,
          createdBy: practitionerId,
          createdAt: TS,
        }),
      ).rejects.toThrow("Program id must match the opaque id format");
      expect(await programs.findById(HUMAN_READABLE_ID)).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects a human-readable program row id and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      await programs.create({
        id: "prog-row-id",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        rows.replaceRow({
          id: HUMAN_READABLE_ID,
          programId: "prog-row-id",
          position: 0,
          exerciseId: "ex-1",
          exerciseVersionId: "ver-1",
          prescriptionType: "stretching",
          params: { hold_s: 30 },
          textSnapshot: { title: "Heel slide" },
          draftUpdatedAt: TS,
        }),
      ).rejects.toThrow("Program row id must match the opaque id format");
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM program_rows WHERE id = ? LIMIT 1",
          [HUMAN_READABLE_ID],
        ),
      ).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects a human-readable share link id and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      await programs.create({
        id: "prog-link-id",
        createdBy: practitionerId,
        createdAt: TS,
      });
      await expect(
        links.createOpenLink({
          id: HUMAN_READABLE_ID,
          programId: "prog-link-id",
          createdAt: TS,
          expiresAt: null,
        }),
      ).rejects.toThrow("Share link id must match the opaque id format");
      expect(await links.findOpenByProgramId("prog-link-id")).toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects a human-readable exercise request id and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const requests = new ExerciseRequestsRepository(storage);
      await expect(
        requests.insert({
          id: HUMAN_READABLE_ID,
          requestedName: "Heel slide",
          requestedBy: practitionerId,
          status: "open",
          createdAt: TS,
          updatedAt: TS,
        }),
      ).rejects.toThrow("Exercise request id must match the opaque id format");
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM exercise_requests WHERE id = ? LIMIT 1",
          [HUMAN_READABLE_ID],
        ),
      ).toBeNull();
    } finally {
      storage.close();
    }
  });
});
