import { describe, expect, it } from "vitest";
import {
  generateOpaqueEntityId,
  isValidOpaqueEntityId,
  OpaqueEntityIdValidationError,
  OPAQUE_ENTITY_ID_FORMAT,
  validateOpaqueEntityId,
} from "../src/domain/opaque-entity-id.js";
import { ExerciseRequestsRepository } from "../src/storage/repositories/exercise-data.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinkDefaultsRepository,
  ShareLinksRepository,
} from "../src/storage/repositories/programs.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { id } from "./helpers/opaque-test-ids.js";

const REJECT_IDS = ["John-Smith-knee", "john-smith-knee", "knee"] as const;

describe("opaque entity id format (unit)", () => {
  it("documents the accepted format", () => {
    expect(OPAQUE_ENTITY_ID_FORMAT).toContain("UUID v4");
  });

  it("rejects human-readable ids", () => {
    for (const bad of REJECT_IDS) {
      expect(isValidOpaqueEntityId(bad)).toBe(false);
    }
    expect(isValidOpaqueEntityId(id("prog-1"))).toBe(true);
    expect(isValidOpaqueEntityId(generateOpaqueEntityId())).toBe(true);
  });
});

describe("DIDI-1000 opaque caller-supplied entity ids", () => {
  it("rejects invalid program ids and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          programs.create({
            id: badId,
            createdBy: practitionerId,
            createdAt: TS,
          }),
        ).rejects.toThrow(OpaqueEntityIdValidationError);
      }
      const validId = generateOpaqueEntityId();
      await programs.create({
        id: validId,
        createdBy: practitionerId,
        createdAt: TS,
      });
      expect(await programs.findById(validId)).not.toBeNull();
      for (const badId of REJECT_IDS) {
        expect(await programs.findById(badId)).toBeNull();
      }
    } finally {
      storage.close();
    }
  });

  it("rejects invalid program row ids and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      await seedApprovedExerciseVersion(storage, practitionerId);
      const programs = new ProgramsRepository(storage);
      const rows = new ProgramRowsRepository(storage);
      const programId = id("prog-row-id");
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
      });
      for (const badId of REJECT_IDS) {
        await expect(
          rows.replaceRow({
            id: badId,
            programId,
            position: 0,
            exerciseId: FIXTURE_EXERCISE_ID,
            exerciseVersionId: FIXTURE_VERSION_ID,
            prescriptionType: "stretching",
            params: { hold_s: 30 },
            textSnapshot: { title: "Heel slide" },
            draftUpdatedAt: TS,
          }),
        ).rejects.toThrow("Program row id must be a UUID v4 opaque id");
      }
      const validRowId = generateOpaqueEntityId();
      await rows.replaceRow({
        id: validRowId,
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM program_rows WHERE id = ? LIMIT 1",
          [validRowId],
        ),
      ).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid share link ids and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const links = new ShareLinksRepository(storage);
      const programId = id("prog-link-id");
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
      });
      for (const badId of REJECT_IDS) {
        await expect(
          links.createOpenLink({
            id: badId,
            programId,
            createdAt: TS,
            expiresAt: null,
          }),
        ).rejects.toThrow("Share link id must be a UUID v4 opaque id");
      }
      const validLinkId = generateOpaqueEntityId();
      await links.createOpenLink({
        id: validLinkId,
        programId,
        createdAt: TS,
        expiresAt: null,
      });
      expect(await links.findOpenByProgramId(programId)).not.toBeNull();
    } finally {
      storage.close();
    }
  });

  it("rejects invalid share link default ids and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const defaults = new ShareLinkDefaultsRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          defaults.upsertPractitionerDefault(badId, practitionerId, {
            expiresIn: SHARE_LINK_EXPIRES_IN.never,
          }),
        ).rejects.toThrow("Share link default id must be a UUID v4 opaque id");
        expect(
          await storage.first<{ id: string }>(
            "SELECT id FROM share_link_defaults WHERE id = ? LIMIT 1",
            [badId],
          ),
        ).toBeNull();
      }
      const validId = generateOpaqueEntityId();
      await defaults.upsertPractitionerDefault(validId, practitionerId, {
        expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
      });
      expect(await defaults.getPractitionerDefault(practitionerId)).toEqual({
        expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
        customExpiresOn: null,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM share_link_defaults WHERE practitioner_id = ? AND scope = ? LIMIT 1",
          [practitionerId, "practitioner"],
        ),
      ).toMatchObject({ id: validId.toLowerCase() });
    } finally {
      storage.close();
    }
  });

  it("rejects invalid exercise request ids and stores nothing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const requests = new ExerciseRequestsRepository(storage);
      for (const badId of REJECT_IDS) {
        await expect(
          requests.insert({
            id: badId,
            requestedName: "Heel slide",
            requestedBy: practitionerId,
            status: "open",
            createdAt: TS,
            updatedAt: TS,
          }),
        ).rejects.toThrow("Exercise request id must be a UUID v4 opaque id");
      }
      const validId = generateOpaqueEntityId();
      await requests.insert({
        id: validId,
        requestedName: "Heel slide",
        requestedBy: practitionerId,
        status: "open",
        createdAt: TS,
        updatedAt: TS,
      });
      expect(
        await storage.first<{ id: string }>(
          "SELECT id FROM exercise_requests WHERE id = ? LIMIT 1",
          [validId],
        ),
      ).not.toBeNull();
      for (const badId of REJECT_IDS) {
        expect(
          await storage.first<{ id: string }>(
            "SELECT id FROM exercise_requests WHERE id = ? LIMIT 1",
            [badId],
          ),
        ).toBeNull();
      }
    } finally {
      storage.close();
    }
  });

  it("validateOpaqueEntityId normalizes UUID to lowercase", () => {
    const upper = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    expect(validateOpaqueEntityId(upper, "Program id")).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });
});
