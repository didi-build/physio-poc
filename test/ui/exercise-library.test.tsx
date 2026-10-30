/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import { ExerciseLibraryApiProvider } from "../../src/ui/api/exercise-library-context.js";
import { USE_LIBRARY_VERSION, KEEP_MINE } from "../../src/ui/copy/exercise-library.js";
import { FiltersSortPanel } from "../../src/ui/exercise-library/FiltersSortPanel.js";
import { DEFAULT_FILTERS } from "../../src/ui/exercise-library/library-filters.js";
import { MyCopyEditorPage } from "../../src/ui/exercise-library/MyCopyEditorPage.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
});

function mockClient(methods: Partial<ExerciseLibraryClient>): ExerciseLibraryClient {
  return methods as ExerciseLibraryClient;
}

function renderMyCopy(client: ExerciseLibraryClient) {
  return render(
    <MemoryRouter initialEntries={["/exercises/ex-1/my-copy"]}>
      <ExerciseLibraryApiProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route
              path="/exercises/:exerciseId/my-copy"
              element={<MyCopyEditorPage />}
            />
          </Routes>
        </ToastProvider>
      </ExerciseLibraryApiProvider>
    </MemoryRouter>,
  );
}

describe("Exercise library UI", () => {
  it("shows matched alias in search results on All exercises", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      searchApproved: vi.fn().mockResolvedValue({
        exercises: [
          {
            exercise_id: "ex-1",
            exercise_version_id: "ver-1",
            exercise_name: "Heel slide",
            category: "Stretching",
            body_regions: ["knee"],
            allowed_prescription_types: ["stretching"],
            matched_alias: "SLR",
            usage_count: 3,
          },
        ],
        next_cursor: null,
        search_link: null,
        total_count: 1,
      }),
    });

    render(
      <MemoryRouter initialEntries={["/exercises/search?q=slr"]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Matched alias:/)).toHaveTextContent("SLR");
    });
  });

  it("applies body region and sort filters through the client", async () => {
    const searchApproved = vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    });
    const listMyExercises = vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [],
        recently_used_and_saved: [],
      },
    });
    const client = mockClient({ searchApproved, listMyExercises });

    render(
      <MemoryRouter initialEntries={["/exercises/search"]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(searchApproved).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filters & sort/i }));

    await user.click(screen.getByRole("button", { name: "Knee" }));
    await user.click(screen.getByRole("radio", { name: "A to Z" }));

    await waitFor(() => {
      expect(searchApproved).toHaveBeenCalledWith(
        expect.objectContaining({
          body_region: "knee",
          sort: "a_to_z",
        }),
      );
    });
  });

  it("calls use_library_version through the client", async () => {
    const updateMyCopy = vi.fn().mockResolvedValue({
      exercise_id: "ex-1",
      library: { title: "Squat" },
      resolved_text: [],
    });
    const client = mockClient({
      getExerciseDetails: vi.fn().mockResolvedValue({
        exercise_id: "ex-1",
        library: { title: "Squat" },
        resolved_text: [
          {
            key: "cue_eccentric",
            resolved: "Mine",
            library_value: "Library",
            library_updated: true,
          },
        ],
      }),
      updateMyCopy,
      removeFromMyExercises: vi.fn(),
    });

    renderMyCopy(client);

    await waitFor(() => {
      expect(screen.getByText(USE_LIBRARY_VERSION)).toBeInTheDocument();
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: USE_LIBRARY_VERSION }));
    expect(updateMyCopy).toHaveBeenCalledWith("ex-1", {
      use_library_version: ["cue_eccentric"],
    });
  });

  it("calls keep_mine through the client", async () => {
    const updateMyCopy = vi.fn().mockResolvedValue({
      exercise_id: "ex-1",
      library: { title: "Squat" },
      resolved_text: [
        {
          key: "cue_eccentric",
          resolved: "Mine",
          library_value: "Library",
          library_updated: true,
        },
      ],
    });
    const client = mockClient({
      getExerciseDetails: vi.fn().mockResolvedValue({
        exercise_id: "ex-1",
        library: { title: "Squat" },
        resolved_text: [
          {
            key: "cue_eccentric",
            resolved: "Mine",
            library_value: "Library",
            library_updated: true,
          },
        ],
      }),
      updateMyCopy,
      removeFromMyExercises: vi.fn(),
    });

    renderMyCopy(client);

    await waitFor(() => {
      expect(screen.getByText(KEEP_MINE)).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByRole("button", { name: KEEP_MINE }));
    expect(updateMyCopy).toHaveBeenCalledWith("ex-1", {
      keep_mine: ["cue_eccentric"],
    });
  });

  it("save to My exercises shows Undo that calls applyUndo on the client", async () => {
    const undoPayload = {
      practitioner_id: "p-1",
      exercise_id: "ex-1",
      snapshot: {
        had_row: false,
        favourite: false,
        saved_at: null,
        last_used_at: null,
        text_overrides_json: "{}",
        param_overrides_json: "{}",
      },
    };
    const applyUndo = vi.fn().mockResolvedValue({ ok: true });
    const saveToMyExercises = vi.fn().mockResolvedValue({ undo: undoPayload });
    const client = mockClient({
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      searchApproved: vi.fn().mockResolvedValue({
        exercises: [
          {
            exercise_id: "ex-1",
            exercise_version_id: "ver-1",
            exercise_name: "Squat",
            category: "Strengthening",
            body_regions: ["knee"],
            allowed_prescription_types: ["isometric"],
            matched_alias: null,
            usage_count: 1,
          },
        ],
        next_cursor: null,
        search_link: null,
        total_count: 1,
      }),
      saveToMyExercises,
      applyUndo,
    });

    render(
      <MemoryRouter initialEntries={["/exercises/search?q=Squat"]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Save Squat to My exercises/i }),
      ).toBeInTheDocument();
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Save Squat to My exercises/i }));

    await waitFor(() => {
      expect(screen.getByText("Saved to My exercises")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(applyUndo).toHaveBeenCalledWith("ex-1", undoPayload);
  });
});

describe("FiltersSortPanel", () => {
  it("renders filter summary when collapsed", () => {
    render(
      <ToastProvider>
        <FiltersSortPanel filters={DEFAULT_FILTERS} onChange={() => {}} />
      </ToastProvider>,
    );
    expect(screen.getByText(/All regions/)).toBeInTheDocument();
  });
});
