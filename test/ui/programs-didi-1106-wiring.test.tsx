/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
} from "../../src/services/programs/types.js";
import {
  TYPE_MISMATCH_HINT_CONCENTRIC,
  TYPE_MISMATCH_HINT_ECCENTRIC,
  TYPE_MISMATCH_HINT_ISOMETRIC,
  TYPE_MISMATCH_SHOW_ME,
  typeMismatchShowMeAriaLabel,
} from "../../src/ui/copy/program-type-mismatch.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
});

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn(),
    searchApproved: vi.fn(),
  } as unknown as ExerciseLibraryClient;
}

function mismatchRow(): ProgramBuilderRow {
  return {
    id: "row-wire",
    position: 0,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: "req-wire",
    pinned_version_number: null,
    prescription_type: "stretching",
    params: { hold_s: 30, sets: 3, days_per_week: 3 },
    params_source: null,
    resolved_params: { hold_s: 30, sets: 3, days_per_week: 3 },
    resolved_params_source: "global_defaults",
    text_snapshot: { title: "Bridge marching" },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    placeholder_state: "type_mismatch",
    type_mismatch_approved_category: "strengthening",
  };
}

describe("DIDI-1106 programs wiring", () => {
  it("wires Show me on the builder banner to the first mismatch row Fix choices", async () => {
    const row = mismatchRow();
    const view: ProgramBuilderView = {
      program_id: "prog-wire",
      code: "PRG-WIRE",
      name: null,
      created_at: "2026-10-24T12:00:00.000Z",
      draft_updated_at: "2026-10-24T12:00:00.000Z",
      auto_save_status: { kind: "not_published_yet" },
      draft_saved_at: "2026-10-24T12:00:00.000Z",
      exercise_count: 1,
      library_updates_to_review: 0,
      type_mismatch_placeholder_count: 1,
      rows: [row],
      open_share_link: false,
      share_link_status: "none",
      last_sent_at: null,
      deleted_at: null,
      routine_origin: null,
    };
    render(
      <MemoryRouter initialEntries={["/programs/PRG-WIRE"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          practitionerSessionClient={stubPractitionerSessionClient()}
          programsClient={
            {
              listPrograms: vi
                .fn()
                .mockResolvedValue({ items: [], matched_code: null }),
              listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
              createProgram: vi.fn(),
              getProgram: vi.fn().mockResolvedValue(view),
              getProgramByCode: vi.fn().mockResolvedValue(view),
              updateProgramName: vi.fn(),
              deleteProgram: vi.fn(),
              restoreProgram: vi.fn(),
              addExerciseRow: vi.fn(),
              reorderRows: vi.fn(),
              duplicateRow: vi.fn(),
              deleteRow: vi.fn(),
              updateRow: vi.fn(),
              applyLibraryUpdate: vi.fn(),
              keepLibraryUpdate: vi.fn(),
              addPlaceholderRow: vi.fn(),
              linkTypeMismatchPlaceholder: vi.fn(),
              undoTypeMismatchPlaceholderLink: vi.fn(),
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    await screen.findByText("1 exercise didn't link");
    await userEvent.click(
      screen.getByRole("button", { name: typeMismatchShowMeAriaLabel() }),
    );
    const article = screen.getByRole("article", { name: /Bridge marching/i });
    const fix = within(article).getByRole("button", { name: "Fix" });
    expect(fix).toHaveAttribute("aria-expanded", "true");
    expect(within(article).getByText(TYPE_MISMATCH_HINT_ISOMETRIC)).toBeInTheDocument();
    expect(
      within(article).getByText(TYPE_MISMATCH_HINT_CONCENTRIC),
    ).toBeInTheDocument();
    expect(within(article).getByText(TYPE_MISMATCH_HINT_ECCENTRIC)).toBeInTheDocument();
    expect(screen.getByText(TYPE_MISMATCH_SHOW_ME)).toBeInTheDocument();
  });
});
