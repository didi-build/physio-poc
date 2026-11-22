/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
  ProgramListItem,
} from "../../src/services/programs/types.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  TYPE_MISMATCH_BANNER_ONE,
  TYPE_MISMATCH_SHOW_ME,
} from "../../src/ui/copy/program-type-mismatch.js";
import { TOAST_UNDO } from "../../src/ui/copy/nav.js";
import { ProgramListCard } from "../../src/ui/programs/ProgramListCard.js";
import { TypeMismatchBuilderBanner } from "../../src/ui/programs/TypeMismatchBuilderBanner.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
});

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    search: vi.fn().mockResolvedValue({ exercises: [], matched_name: null }),
    getExerciseDetail: vi.fn(),
    searchAliasHints: vi.fn().mockResolvedValue([]),
  } as unknown as ExerciseLibraryClient;
}

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

function mismatchRowL9(): ProgramBuilderRow {
  return {
    id: "row-l9",
    position: 0,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: "req-l9",
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

describe("DIDI-1106 QA R4 UI (B2, D9, L9)", () => {
  it("B2 styles Show me as a teal pg-link-btn", () => {
    render(<TypeMismatchBuilderBanner count={1} onShowMe={() => {}} />);
    const showMe = screen.getByRole("button", {
      name: "Show me exercises that didn't link",
    });
    expect(showMe).toHaveTextContent(TYPE_MISMATCH_SHOW_ME);
    expect(showMe).toHaveClass("pg-link-btn");
    expect(showMe).toHaveClass("pg-type-mismatch-banner-action");
  });

  it("D9 shows the programs list flag when type_mismatch_placeholder_count is positive", () => {
    const item: ProgramListItem = {
      program_id: "p-d9",
      code: "PRG-D9",
      name: "Program",
      exercise_count: 1,
      draft_updated_at: "2026-10-24T12:00:00.000Z",
      auto_save_status: { kind: "not_published_yet" },
      library_updates_to_review: 0,
      type_mismatch_placeholder_count: 1,
      share_link_status: "none",
      last_sent_at: null,
      deleted_at: null,
      routine_origin: null,
    };
    render(
      <MemoryRouter>
        <ProgramListCard item={item} matchedCode={null} />
      </MemoryRouter>,
    );
    expect(screen.getByText(TYPE_MISMATCH_BANNER_ONE)).toBeInTheDocument();
  });

  it("L9 shows Undo on the link toast when the client returns undo", async () => {
    const row = mismatchRowL9();
    const view: ProgramBuilderView = {
      program_id: "prog-l9",
      code: "PRG-L9",
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
    const linkTypeMismatchPlaceholder = vi.fn().mockResolvedValue({
      program: { ...view, draft_updated_at: "2026-10-24T12:01:00.000Z" },
      undo: {
        kind: "placeholder_type_mismatch_link",
        row_id: row.id,
        exercise_request_id: "req-l9",
        prescription_type: "stretching",
        params: {},
        note: null,
        text_snapshot: row.text_snapshot,
      },
    });
    setExerciseLibraryClientForTests(stubLibraryClient());
    setExerciseRequestsClientForTests(stubRequestsClient());
    render(
      <MemoryRouter initialEntries={["/programs/PRG-L9"]}>
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
              linkTypeMismatchPlaceholder,
              undoTypeMismatchPlaceholderLink: vi.fn(),
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    const article = await screen.findByRole("article", { name: /Bridge marching/i });
    await userEvent.click(within(article).getByRole("button", { name: "Fix" }));
    await userEvent.click(
      within(article).getByRole("button", {
        name: "Link Bridge marching as Concentric",
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TOAST_UNDO })).toBeInTheDocument();
    });
  });
});
