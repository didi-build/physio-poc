/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { RoutinesClient } from "../../src/ui/api/routines-client.js";
import {
  BEFORE_YOU_PUBLISH,
  DRAFT_DETAIL_VISIBILITY,
  DRAFT_PUBLISH_NOTE,
  EDIT_DRAFT,
  EDIT_FOR_EVERYONE,
  NEW_ROUTINE,
  PUBLISH_POINT_NO_REVIEW,
  PUBLISH_THIS_ROUTINE,
  VALIDATION_ADD_EXERCISE,
  VALIDATION_ADD_ROUTINE_NAME,
  VERSION_HISTORY,
  saveAsVersionNext,
  toastSavedCommunityVersion,
} from "../../src/ui/copy/routines.js";
import { TOAST_UNDO } from "../../src/ui/copy/nav.js";
import { openMigratedDatabase } from "../helpers/exercise-sqlite-fixture.js";
import {
  seedPractitioner,
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
} from "../helpers/exercise-sqlite-fixture.js";
import { ROUTINE_NAME_LABEL } from "../../src/ui/copy/routines.js";
import { seedApprovedExerciseForBuilder } from "../helpers/from-routine-http-fixture.js";
import { id } from "../helpers/opaque-test-ids.js";
import {
  appDepsForRoutinesHttpUi,
  createRoutinesHttpFetch,
} from "../helpers/routines-http-ui-fixture.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: { new_from_requests: [], pinned: [], recently_used_and_saved: [] },
    }),
    searchApproved: vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    }),
    getExerciseDetails: vi.fn().mockResolvedValue({
      exercise_id: FIXTURE_EXERCISE_ID,
      exercise_version_id: FIXTURE_VERSION_ID,
      version_number: 1,
      category: "Stretching",
      body_regions: ["knee"],
      aliases: [],
      allowed_prescription_types: ["stretching"],
      usage_count: 0,
      approved_at: "2026-01-01",
      media_set_id: null,
      in_my_exercises: false,
      favourite: false,
      library: { title: "Heel slide", cue_stretching: null },
    }),
  } as unknown as ExerciseLibraryClient;
}

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    listInProgress: vi.fn().mockResolvedValue({ items: [] }),
    getInProgressCount: vi.fn().mockResolvedValue({ count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProgramsClient;
}

function renderApp(path: string, client: RoutinesClient) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={stubProgramsClient()}
        routinesClient={client}
      />
    </MemoryRouter>,
  );
}

describe("Routine authoring UI (DIDI-1024)", () => {
  it("cancels an untouched new routine from the editor", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1024"),
        "ui1024@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "ui1024@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, {
          stubPlannedBodyRegionApi: true,
        }),
      });
      renderApp("/routines/new", client);
      await waitFor(
        () => {
          expect(screen.getByRole("heading", { name: NEW_ROUTINE })).toBeTruthy();
        },
        { timeout: 15_000 },
      );
      const before = await client.listMyRoutines();
      const routineId = before.drafts[before.drafts.length - 1]?.routine_id ?? "";
      expect(routineId.length).toBeGreaterThan(0);
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await waitFor(async () => {
        const list = await client.listMyRoutines();
        expect(list.drafts.some((draft) => draft.routine_id === routineId)).toBe(false);
      });
    } finally {
      storage.close();
    }
  });

  it("shows publish validation and publishes from draft detail", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage, id("ui-1024b"), "pub@example.com");
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "pub@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, {
          stubPlannedBodyRegionApi: true,
        }),
      });
      const created = await client.createRoutineDraft({ body_region_id: "br-knee" });
      const routineId = created.routine_id;
      await client.autosaveRoutineDraft(routineId, {
        name: "Shoulder starter",
        rows: [
          {
            position: 0,
            exercise_id: FIXTURE_EXERCISE_ID,
            exercise_version_id: FIXTURE_VERSION_ID,
            prescription_type: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      renderApp(`/routines/${routineId}`, client);
      await waitFor(() => {
        expect(screen.getByText(DRAFT_DETAIL_VISIBILITY)).toBeTruthy();
        expect(screen.getByText(DRAFT_PUBLISH_NOTE)).toBeTruthy();
      });
      await userEvent.click(screen.getByTestId("rt-draft-detail-publish"));
      const sheet = await screen.findByRole("dialog");
      expect(within(sheet).getByText(PUBLISH_THIS_ROUTINE)).toBeTruthy();
      expect(within(sheet).getByText(PUBLISH_POINT_NO_REVIEW)).toBeTruthy();
      await userEvent.click(within(sheet).getByTestId("rt-publish-confirm"));
      await waitFor(() => {
        expect(screen.queryByText(DRAFT_DETAIL_VISIBILITY)).toBeNull();
        expect(screen.getByText(EDIT_FOR_EVERYONE)).toBeTruthy();
      });
    } finally {
      storage.close();
    }
  });

  it("discards draft with undo from draft detail", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1024c"),
        "disc@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "disc@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, {
          stubPlannedBodyRegionApi: true,
        }),
      });
      const undoSpy = vi.spyOn(client, "undoRoutineDraftDiscard");
      const created = await client.createRoutineDraft({ body_region_id: "br-knee" });
      const routineId = created.routine_id;
      await client.autosaveRoutineDraft(routineId, { name: "Discard me" });
      renderApp(`/routines/${routineId}`, client);
      await waitFor(() => {
        expect(screen.getByTestId("rt-discard-draft")).toBeTruthy();
      });
      await userEvent.click(screen.getByTestId("rt-discard-draft"));
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await waitFor(async () => {
        const list = await client.listMyRoutines();
        expect(list.drafts.some((draft) => draft.routine_id === routineId)).toBe(false);
      });
      await userEvent.click(screen.getByRole("button", { name: TOAST_UNDO }));
      expect(undoSpy).toHaveBeenCalledTimes(1);
      await waitFor(async () => {
        const list = await client.listMyRoutines();
        expect(list.drafts.some((draft) => draft.routine_id === routineId)).toBe(true);
      });
      await waitFor(() => {
        expect(screen.getByText(DRAFT_DETAIL_VISIBILITY)).toBeTruthy();
      });
    } finally {
      storage.close();
    }
  });

  it("shows publish validation on the editor when publish fails", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage, id("ui-1024d"), "val@example.com");
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "val@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, {
          stubPlannedBodyRegionApi: true,
        }),
      });
      const created = await client.createRoutineDraft({ body_region_id: "br-knee" });
      renderApp(`/routines/${created.routine_id}/edit`, client);
      await waitFor(() => {
        expect(screen.getByTestId("rt-draft-publish")).toBeTruthy();
      });
      await userEvent.click(screen.getByTestId("rt-draft-publish"));
      const sheet = await screen.findByRole("dialog");
      await userEvent.click(within(sheet).getByTestId("rt-publish-confirm"));
      await waitFor(() => {
        expect(screen.getByText(BEFORE_YOU_PUBLISH)).toBeTruthy();
        expect(screen.getByText(VALIDATION_ADD_ROUTINE_NAME)).toBeTruthy();
        expect(screen.getByText(VALIDATION_ADD_EXERCISE)).toBeTruthy();
      });
    } finally {
      storage.close();
    }
  });

  it("saves edit for everyone with expected published version", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(storage, id("ui-1024e"), "efe@example.com");
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "efe@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, {
          stubPlannedBodyRegionApi: true,
        }),
      });
      const created = await client.createRoutineDraft({ body_region_id: "br-knee" });
      const routineId = created.routine_id;
      await client.autosaveRoutineDraft(routineId, {
        name: "Community knee",
        rows: [
          {
            position: 0,
            exercise_id: FIXTURE_EXERCISE_ID,
            exercise_version_id: FIXTURE_VERSION_ID,
            prescription_type: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      await client.publishRoutineDraft(routineId);
      renderApp(`/routines/${routineId}/edit-for-everyone`, client);
      await waitFor(() => {
        expect(screen.getByTestId("rt-save-community-version")).toBeTruthy();
      });
      const nameInput = screen.getByLabelText(ROUTINE_NAME_LABEL);
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Community knee v2");
      expect(screen.getByText(saveAsVersionNext(1))).toBeTruthy();
      await userEvent.click(screen.getByTestId("rt-save-community-version"));
      await waitFor(() => {
        expect(screen.getByText(toastSavedCommunityVersion(2))).toBeTruthy();
      });
    } finally {
      storage.close();
    }
  });

  it("restores an older version from version history", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1024f"),
        "hist@example.com",
      );
      await seedApprovedExerciseForBuilder(storage, author);
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "hist@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, {
          stubPlannedBodyRegionApi: true,
        }),
      });
      const created = await client.createRoutineDraft({ body_region_id: "br-knee" });
      const routineId = created.routine_id;
      await client.autosaveRoutineDraft(routineId, {
        name: "History knee",
        rows: [
          {
            position: 0,
            exercise_id: FIXTURE_EXERCISE_ID,
            exercise_version_id: FIXTURE_VERSION_ID,
            prescription_type: "stretching",
            params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      await client.publishRoutineDraft(routineId);
      await client.saveRoutineCommunityVersion(routineId, {
        expected_published_version: 1,
        name: "History knee v2",
        rows: [
          {
            position: 0,
            exercise_id: FIXTURE_EXERCISE_ID,
            exercise_version_id: FIXTURE_VERSION_ID,
            exercise_name: "Heel slide",
            prescription_type: "stretching",
            params: { hold_s: 45, per_day: { min: 1, max: 2 }, days_per_week: 7 },
          },
        ],
      });
      renderApp(`/routines/${routineId}/versions`, client);
      await waitFor(() => {
        expect(screen.getByText(VERSION_HISTORY)).toBeTruthy();
      });
      await userEvent.click(screen.getByTestId("rt-restore-v1"));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByTestId("rt-restore-confirm"));
      await waitFor(() => {
        expect(screen.getByText(/Version 1 restored as version 3/)).toBeTruthy();
      });
    } finally {
      storage.close();
    }
  });

  it("deep links edit draft from draft detail", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1024g"),
        "link@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "link@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, {
          stubPlannedBodyRegionApi: true,
        }),
      });
      const created = await client.createRoutineDraft({ body_region_id: "br-knee" });
      renderApp(`/routines/${created.routine_id}`, client);
      await waitFor(() => {
        expect(screen.getByText(EDIT_DRAFT)).toBeTruthy();
      });
      await userEvent.click(screen.getByText(EDIT_DRAFT));
      await waitFor(() => {
        expect(screen.getByTestId("rt-draft-publish")).toBeTruthy();
      });
    } finally {
      storage.close();
    }
  });
});
