/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import type {
  ProgramBuilderRow,
  ProgramBuilderView,
} from "../../src/services/programs/types.js";
import { ADD_EXERCISE } from "../../src/ui/copy/programs.js";
import {
  TYPE_MISMATCH_FIX,
  TYPE_MISMATCH_PICK_ANOTHER_EXERCISE,
  typeMismatchPublishFixAriaLabel,
} from "../../src/ui/copy/program-type-mismatch.js";
import { CANCEL } from "../../src/ui/copy/my-defaults.js";
import { PUBLISH_SHEET_TITLE } from "../../src/ui/copy/program-publish.js";
import { TYPE_MISMATCH_FIX_ROW_QUERY_PARAM } from "../../src/app-routes.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";

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

function mismatchRow(id: string, title: string, position: number): ProgramBuilderRow {
  return {
    id,
    position,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: `req-${id}`,
    pinned_version_number: null,
    prescription_type: "stretching",
    params: { hold_s: 30, sets: 3, days_per_week: 3 },
    params_source: null,
    resolved_params: { hold_s: 30, sets: 3, days_per_week: 3 },
    resolved_params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    placeholder_state: "type_mismatch",
    type_mismatch_approved_category: "strengthening",
  };
}

function libraryClientWithHeel(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [
          {
            exercise_id: "ex-heel",
            exercise_name: "Heel raise",
            category: "Strengthening",
            body_regions: ["Ankle"],
            section: "pinned",
          },
        ],
        recently_used_and_saved: [],
      },
    }),
    searchApproved: vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    }),
  } as unknown as ExerciseLibraryClient;
}

function builderView(rows: ProgramBuilderRow[]): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: rows.length,
    library_updates_to_review: 0,
    type_mismatch_placeholder_count: rows.filter(
      (row) => row.placeholder_state === "type_mismatch",
    ).length,
    rows,
    open_share_link: false,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
  };
}

function builderStubs(view: ProgramBuilderView): ProgramsClient {
  const deleteRow = vi.fn();
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
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
    deleteRow,
    updateRow: vi.fn(),
    applyLibraryUpdate: vi.fn(),
    keepLibraryUpdate: vi.fn(),
    addPlaceholderRow: vi.fn(),
    linkTypeMismatchPlaceholder: vi.fn(),
    undoTypeMismatchPlaceholderLink: vi.fn(),
    publishProgram: vi.fn(),
    fetchShareView: vi.fn().mockResolvedValue(null),
    getShareLink: vi.fn(),
  } as unknown as ProgramsClient;
}

function renderPhysio(initialEntry: string, programsClient: ProgramsClient) {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <PhysioApp
            exerciseLibraryClient={libraryClientWithHeel()}
            exerciseRequestsClient={stubRequestsClient()}
            programsClient={programsClient}
            practitionerSessionClient={stubPractitionerSessionClient()}
          />
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

async function expectFixPanelFocused(title: string) {
  const article = await screen.findByRole("article", { name: new RegExp(title, "i") });
  const fix = within(article).getByRole("button", { name: TYPE_MISMATCH_FIX });
  await waitFor(() => {
    expect(fix).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(fix);
  });
}

describe("DIDI-1106 builder page Fix deep links", () => {
  it("opens the Fix panel with focus from the /publish route and fix_row_id navigation", async () => {
    setExerciseLibraryClientForTests(libraryClientWithHeel());
    const row = mismatchRow("row-mm", "Bridge marching", 0);
    const view = builderView([row]);
    const { router } = renderPhysio("/programs/PRG-TEST/publish", builderStubs(view));
    const fixPublish = await screen.findByRole("link", {
      name: typeMismatchPublishFixAriaLabel("Bridge marching"),
    });
    await userEvent.click(fixPublish);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/programs/PRG-TEST");
    });
    await expectFixPanelFocused("Bridge marching");
    await waitFor(() => {
      expect(router.state.location.search).not.toContain(
        TYPE_MISMATCH_FIX_ROW_QUERY_PARAM,
      );
    });
  });

  it("opens Fix from the publish sheet on the builder route without leaving fix_row_id in the URL", async () => {
    setExerciseLibraryClientForTests(libraryClientWithHeel());
    const row = mismatchRow("row-mm2", "Heel slide", 0);
    const view = builderView([row]);
    renderPhysio("/programs/PRG-TEST", builderStubs(view));
    await screen.findByRole("article", { name: /Heel slide/i });
    const publishButton = document.querySelector(
      ".pg-publish-card-primary",
    ) as HTMLButtonElement;
    expect(publishButton).toBeTruthy();
    await userEvent.click(publishButton);
    const dialog = await screen.findByRole("dialog", { name: PUBLISH_SHEET_TITLE });
    const fixPublish = within(dialog).getByRole("link", {
      name: typeMismatchPublishFixAriaLabel("Heel slide"),
    });
    await userEvent.click(fixPublish);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: PUBLISH_SHEET_TITLE })).toBeNull();
    });
    await expectFixPanelFocused("Heel slide");
  });

  it("opens the Fix panel when fix_row_id is present on the builder URL", async () => {
    setExerciseLibraryClientForTests(libraryClientWithHeel());
    const row = mismatchRow("row-deep", "Deep link row", 0);
    const view = builderView([row]);
    const { router } = renderPhysio(
      `/programs/PRG-TEST?${TYPE_MISMATCH_FIX_ROW_QUERY_PARAM}=${encodeURIComponent(row.id)}`,
      builderStubs(view),
    );
    await expectFixPanelFocused("Deep link row");
    await waitFor(() => {
      expect(router.state.location.search).not.toContain(
        TYPE_MISMATCH_FIX_ROW_QUERY_PARAM,
      );
    });
  });

  it("keeps the mismatch row after Pick another exercise, Cancel, then ordinary Add exercise", async () => {
    setExerciseLibraryClientForTests(libraryClientWithHeel());
    const row = mismatchRow("row-keep", "Mismatch stay", 0);
    const view = builderView([row]);
    const stubs = builderStubs(view);
    renderPhysio("/programs/PRG-TEST", stubs);
    const article = await screen.findByRole("article", { name: /Mismatch stay/i });
    await userEvent.click(
      within(article).getByRole("button", { name: TYPE_MISMATCH_FIX }),
    );
    await userEvent.click(
      within(article).getByRole("button", {
        name: TYPE_MISMATCH_PICK_ANOTHER_EXERCISE,
      }),
    );
    await screen.findByRole("heading", { name: ADD_EXERCISE });
    await userEvent.click(screen.getByRole("button", { name: CANCEL }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: ADD_EXERCISE })).toBeNull();
    });
    expect(screen.getByRole("article", { name: /Mismatch stay/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: ADD_EXERCISE }));
    await screen.findByRole("heading", { name: ADD_EXERCISE });
    expect(stubs.deleteRow).not.toHaveBeenCalled();
    expect(screen.getByRole("article", { name: /Mismatch stay/i })).toBeInTheDocument();
  });
});
