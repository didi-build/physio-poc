import { describe, expect, it } from "vitest";
import { ExerciseLibraryService } from "../src/services/exercise-library/exercise-library-service.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import { PractitionerExercisesRepository } from "../src/storage/repositories/exercise-data.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";

const FORM_OPENED = "2026-10-30T10:00:00.000Z";
const BEFORE_FORM = "2026-10-30T09:00:00.000Z";
const AFTER_FORM = "2026-10-30T11:00:00.000Z";

async function seedApprovedTitle(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  title: string,
  exerciseId = "ex-approved-1",
) {
  await seedExercise(storage, practitionerId, exerciseId);
  await storage.run(VERSION_INSERT_SQL, [
    ...versionInsertBindings({
      id: "ver-approved-1",
      exercise_id: exerciseId,
      status: "approved",
      approved_by: practitionerId,
      approved_at: TS,
      title,
      cue_stretching: "Hold",
    }),
  ]);
}

describe("ExerciseRequestsService (integration, SQLite)", () => {
  it("lists similar library matches and in-progress drafts, excluding unapproved-only rows from library", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practA = await seedPractitioner(storage, "pract-a", "a@example.com");
      const practB = await seedPractitioner(storage, "pract-b", "b@example.com");
      await seedApprovedTitle(storage, practA, "Copenhagen plank approved");
      await seedExercise(storage, practB, "ex-draft-search");
      await storage.run(VERSION_INSERT_SQL, [
        ...versionInsertBindings({
          id: "ver-draft-only",
          exercise_id: "ex-draft-search",
          title: "Copenhagen plank draft only",
        }),
      ]);

      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      await service.submitRequest({
        practitionerId: practB,
        requestedName: "Copenhagen plank in progress",
        formOpenedAt: FORM_OPENED,
      });

      const similar = await service.listSimilar({
        practitionerId: practA,
        query: "Copenhagen plank",
      });
      expect(
        similar.library_matches.some((row) => row.exercise_name.includes("approved")),
      ).toBe(true);
      expect(
        similar.library_matches.some((row) => row.exercise_name.includes("draft only")),
      ).toBe(false);
      expect(similar.drafts_in_progress.length).toBeGreaterThanOrEqual(1);

      const library = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const search = await library.searchApprovedExercises({
        practitionerId: practA,
        query: "Copenhagen",
      });
      expect(
        search.exercises.every((row) => !row.exercise_name.includes("draft only")),
      ).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("returns conflict on submit when a similar request was created after the form opened", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(storage, "pract-req", "req@example.com");
      const other = await seedPractitioner(storage, "pract-other", "other@example.com");

      const otherService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await otherService.submitRequest({
        practitionerId: other,
        requestedName: "Short lever plank",
        formOpenedAt: BEFORE_FORM,
      });
      expect(created.outcome).toBe("created");

      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T12:00:00.000Z",
      });
      const conflict = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Short lever plank variation",
        exerciseNote: "supine",
        formOpenedAt: FORM_OPENED,
      });
      expect(conflict.outcome).toBe("conflict");
      if (conflict.outcome !== "conflict") {
        return;
      }
      expect(conflict.similar_request.requested_name).toBe("Short lever plank");

      const noConflictBefore = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Unrelated move",
        formOpenedAt: FORM_OPENED,
        resolution: "submit",
      });
      expect(noConflictBefore.outcome).toBe("created");
    } finally {
      storage.close();
    }
  });

  it("merge adds the requester name and exercise note to the existing draft request", async () => {
    const storage = await openMigratedDatabase();
    try {
      const owner = await seedPractitioner(storage, "pract-owner", "owner@example.com");
      const merger = await seedPractitioner(
        storage,
        "pract-merge",
        "merge@example.com",
      );

      const ownerService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const existing = await ownerService.submitRequest({
        practitionerId: owner,
        requestedName: "Copenhagen plank",
        formOpenedAt: BEFORE_FORM,
      });
      expect(existing.outcome).toBe("created");
      if (existing.outcome !== "created") {
        return;
      }

      const mergeService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T12:00:00.000Z",
      });
      const merged = await mergeService.submitRequest({
        practitionerId: merger,
        requestedName: "Copenhagen plank short lever",
        exerciseNote: "rehab version",
        formOpenedAt: FORM_OPENED,
        resolution: "merge",
        conflictRequestId: existing.request_id,
      });
      expect(merged.outcome).toBe("merged");

      const view = await ownerService.getRequest({
        practitionerId: owner,
        requestId: existing.request_id,
      });
      expect(view.exercise_note).toContain("rehab version");
      expect(view.exercise_note).toContain("Copenhagen plank short lever");
    } finally {
      storage.close();
    }
  });

  it("approve records approver and time, adds to requester My exercises, and removes from in-progress list", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        "pract-apr-req",
        "apr-req@example.com",
      );
      const approver = await seedPractitioner(
        storage,
        "pract-apr-app",
        "apr-app@example.com",
      );
      const approvedAt = "2026-10-30T15:00:00.000Z";

      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Heel slide request",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }

      const beforeList = await service.listInProgress({ practitionerId: approver });
      expect(beforeList.in_progress_count).toBe(1);

      const approveService = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => approvedAt,
      });
      const approved = await approveService.approveRequest({
        practitionerId: approver,
        requestId: created.request_id,
      });
      expect(approved.approved_by).toBe(approver);
      expect(approved.approved_at).toBe(approvedAt);
      expect(approved.version_number).toBe(1);

      const afterList = await approveService.listInProgress({
        practitionerId: approver,
      });
      expect(afterList.in_progress_count).toBe(0);

      const myExercises = new PractitionerExercisesRepository(storage);
      const row = await myExercises.find(requester, approved.exercise_id);
      expect(row).not.toBeNull();

      const version = await storage.first<{ approved_by: string; status: string }>(
        "SELECT approved_by, status FROM exercise_versions WHERE id = ?",
        [approved.exercise_version_id],
      );
      expect(version?.status).toBe("approved");
      expect(version?.approved_by).toBe(approver);
    } finally {
      storage.close();
    }
  });

  it("rejects exercise notes that contain patient details", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG);
      await expect(
        service.submitRequest({
          practitionerId: practId,
          requestedName: "Safe name",
          exerciseNote: "contact patient@example.com",
          formOpenedAt: FORM_OPENED,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
    } finally {
      storage.close();
    }
  });

  it("exposes in-progress count for the Requests badge", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage);
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      expect(await service.getInProgressCount({ practitionerId: practId })).toBe(0);
      await service.submitRequest({
        practitionerId: practId,
        requestedName: "New move",
        formOpenedAt: FORM_OPENED,
      });
      expect(await service.getInProgressCount({ practitionerId: practId })).toBe(1);
    } finally {
      storage.close();
    }
  });

  it("rejects calls when the path practitioner id is unknown", async () => {
    const storage = await openMigratedDatabase();
    try {
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG);
      await expect(
        service.listSimilar({ practitionerId: "pract-missing", query: "Heel slide" }),
      ).rejects.toMatchObject({ code: "practitioner_not_found" });
    } finally {
      storage.close();
    }
  });

  it("allows another practitioner to review an in-progress request but not after approval", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        "pract-req-view",
        "rv@example.com",
      );
      const reviewer = await seedPractitioner(
        storage,
        "pract-rev-view",
        "vw@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "View draft move",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }

      const review = await service.getRequest({
        practitionerId: reviewer,
        requestId: created.request_id,
      });
      expect(review.requested_by).toBe(requester);

      await service.approveRequest({
        practitionerId: reviewer,
        requestId: created.request_id,
      });

      await expect(
        service.getRequest({
          practitionerId: reviewer,
          requestId: created.request_id,
        }),
      ).rejects.toMatchObject({ code: "request_not_found" });
    } finally {
      storage.close();
    }
  });

  it("does not conflict when a similar request was created exactly at form_opened_at", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        "pract-boundary",
        "bd@example.com",
      );
      const other = await seedPractitioner(
        storage,
        "pract-boundary-other",
        "bo@example.com",
      );
      const boundary = "2026-10-30T11:00:00.000Z";

      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "44444444-4444-4444-8444-444444444444",
          "Boundary plank",
          null,
          other,
          "open",
          null,
          boundary,
          boundary,
        ],
      );

      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => "2026-10-30T12:00:00.000Z",
      });
      const atBoundary = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Boundary plank variation",
        formOpenedAt: boundary,
      });
      expect(atBoundary.outcome).toBe("created");
    } finally {
      storage.close();
    }
  });

  it("conflicts when a similar request was created strictly after form_opened_at", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(
        storage,
        "pract-after",
        "af@example.com",
      );
      const other = await seedPractitioner(
        storage,
        "pract-after-other",
        "ao@example.com",
      );
      const formOpened = "2026-10-30T11:00:00.000Z";

      await storage.run(
        `INSERT INTO exercise_requests (
          id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "55555555-5555-4555-8555-555555555555",
          "After boundary plank",
          null,
          other,
          "open",
          null,
          "2026-10-30T11:00:00.001Z",
          "2026-10-30T11:00:00.001Z",
        ],
      );

      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG);
      const conflict = await service.submitRequest({
        practitionerId: requester,
        requestedName: "After boundary plank variation",
        formOpenedAt: formOpened,
      });
      expect(conflict.outcome).toBe("conflict");
    } finally {
      storage.close();
    }
  });

  it("keeps edited draft titles out of approved search", async () => {
    const storage = await openMigratedDatabase();
    try {
      const requester = await seedPractitioner(storage, "pract-edit", "ed@example.com");
      const reviewer = await seedPractitioner(
        storage,
        "pract-edit-rev",
        "er@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        now: () => AFTER_FORM,
      });
      const created = await service.submitRequest({
        practitionerId: requester,
        requestedName: "Editable draft move",
        formOpenedAt: FORM_OPENED,
      });
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        return;
      }

      const editedTitle = "Editable draft move edited unique";
      await service.updateDraft({
        practitionerId: reviewer,
        requestId: created.request_id,
        patch: { title: editedTitle },
      });

      const library = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      const search = await library.searchApprovedExercises({
        practitionerId: reviewer,
        query: editedTitle,
      });
      expect(search.exercises).toHaveLength(0);
    } finally {
      storage.close();
    }
  });
});
