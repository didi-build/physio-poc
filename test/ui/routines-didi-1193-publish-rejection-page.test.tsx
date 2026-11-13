// @vitest-environment jsdom
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  RoutinesAuthoringError,
  RoutinesClient,
  setRoutinesClientForTests,
} from "../../src/ui/api/routines-client.js";
import {
  MISSING_IMAGES_BLOCK_HEADING,
  PUBLISH,
  PUBLISH_NOW,
} from "../../src/ui/copy/routines.js";
import type {
  RoutineDetailsDraft,
  RoutineExerciseRow,
} from "../../src/services/routines/types.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
  setRoutinesClientForTests(null);
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

const rowReady: RoutineExerciseRow = {
  position: 0,
  exercise_id: "ex-1",
  exercise_version_id: "ver-1",
  exercise_name: "Heel slide",
  prescription_type: "stretching",
  params: { hold_s: 30 },
  lacks_start_or_end_image: false,
};

const rowBlockedA: RoutineExerciseRow = {
  ...rowReady,
  lacks_start_or_end_image: true,
};

const rowBlockedB: RoutineExerciseRow = {
  ...rowReady,
  position: 1,
  exercise_id: "ex-2",
  exercise_version_id: "ver-2",
  exercise_name: "Squat",
  lacks_start_or_end_image: true,
};

function draftDetails(rows: RoutineExerciseRow[]): RoutineDetailsDraft {
  return {
    routine_id: "routine-1193",
    body_region_id: "br-knee",
    body_region_label: "Knee",
    condition_id: null,
    condition_label: null,
    who_its_for: null,
    sent_program_count: 0,
    sent_program_codes: [],
    conditions_available: false,
    is_draft: true,
    draft: {
      routine_version_id: "rv-1",
      name: "Knee draft",
      draft_updated_at: "2026-01-01T00:00:00.000Z",
      rows,
    },
    community: null,
    my_copy: null,
    personal_changes: null,
    community_change_list: null,
  };
}

describe("Routine draft detail publish rejection DIDI-1193", () => {
  it("reloads rows after server missing_images_block_publish and focuses the heading", async () => {
    let detailsCall = 0;
    const getRoutineDetails = vi.fn().mockImplementation(() => {
      detailsCall += 1;
      if (detailsCall === 1) {
        return Promise.resolve(draftDetails([rowReady]));
      }
      return Promise.resolve(draftDetails([rowBlockedA, rowBlockedB]));
    });
    const publishRoutineDraft = vi
      .fn()
      .mockRejectedValue(
        new RoutinesAuthoringError(
          MISSING_IMAGES_BLOCK_HEADING,
          "missing_images_block_publish",
        ),
      );
    const client = {
      getRoutineDetails,
      publishRoutineDraft,
      autosaveRoutineDraft: vi.fn().mockResolvedValue({ ok: true }),
      discardRoutineDraft: vi.fn(),
    } as unknown as RoutinesClient;
    setRoutinesClientForTests(client);

    render(
      <MemoryRouter initialEntries={["/routines/routine-1193"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={client}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: PUBLISH })).toBeTruthy();
    });
    await userEvent.click(screen.getByRole("button", { name: PUBLISH }));
    await userEvent.click(screen.getByRole("button", { name: PUBLISH_NOW }));

    const notice = await screen.findByTestId("routine-publish-missing-images-notice");
    await waitFor(() => {
      expect(within(notice).getAllByRole("button", { name: /Remove / }).length).toBe(2);
    });
    expect(getRoutineDetails.mock.calls.length).toBeGreaterThanOrEqual(2);
    const heading = within(notice).getByRole("heading", {
      name: MISSING_IMAGES_BLOCK_HEADING,
    });
    expect(document.activeElement).toBe(heading);
    expect(publishRoutineDraft).toHaveBeenCalled();
  });
});
