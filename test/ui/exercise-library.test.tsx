/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fillPhysioAppRoutePattern,
  physioAppSpaRoutePath,
} from "../../src/app-routes.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import { ExerciseLibraryApiProvider } from "../../src/ui/api/exercise-library-context.js";
import {
  BACK_LIBRARY,
  EXERCISE_DETAILS,
  KEEP_MINE,
  LIB_HEADING,
  MY_COPY,
  NO_EDITS_YET,
  NO_SAVED_WITH_FILTERS,
  NOT_IN_LIBRARY_YET,
  PINNED_PREFIX,
  SUBMIT_REQUEST,
  USE_LIBRARY_VERSION,
  editsOnTopOfLibraryLine,
  noExactMatchHeading,
  nothingInMyMatches,
} from "../../src/ui/copy/exercise-library.js";
import { MEDIA_LOOP_CAPTION_STRENGTH_SUFFIX } from "../../src/ui/copy/exercise-media.js";
import { NAV_TAB_EXERCISES } from "../../src/ui/copy/nav.js";
import { UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS } from "./exercise-library-unsourced-guard.js";
import {
  LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
  assertExerciseLibraryErrorPageCopy,
  assertLoadingErrorRegionsOnlyAllowlisted,
  exerciseLibraryDetailsErrorPageAllowlist,
  exerciseLibraryListErrorPageAllowlistAll,
  exerciseLibraryListErrorPageAllowlistMine,
  exerciseLibraryMyCopyErrorPageAllowlist,
} from "./exercise-library-loading-error-copy-guard.js";
import { ExerciseDetailsPage } from "../../src/ui/exercise-library/ExerciseDetailsPage.js";
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

function renderPhysio(initialEntry: string, client: ExerciseLibraryClient) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp exerciseLibraryClient={client} />
    </MemoryRouter>,
  );
}

function expectLibraryErrorChrome(pageHeading: string) {
  expect(screen.getByRole("link", { name: BACK_LIBRARY })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: pageHeading })).toBeInTheDocument();
  expect(screen.getAllByRole("navigation", { name: "Main" }).length).toBeGreaterThan(0);
  expect(
    screen.getAllByRole("link", { name: NAV_TAB_EXERCISES }).length,
  ).toBeGreaterThan(0);
}

function renderMyCopy(client: ExerciseLibraryClient) {
  return render(
    <MemoryRouter
      initialEntries={[
        fillPhysioAppRoutePattern("exerciseMyCopy", { exerciseId: "ex-1" }),
      ]}
    >
      <ExerciseLibraryApiProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route
              path={physioAppSpaRoutePath("exerciseMyCopy")}
              element={<MyCopyEditorPage />}
            />
          </Routes>
        </ToastProvider>
      </ExerciseLibraryApiProvider>
    </MemoryRouter>,
  );
}

function renderDetails(client: ExerciseLibraryClient) {
  return render(
    <MemoryRouter
      initialEntries={[
        fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-1" }),
      ]}
    >
      <ExerciseLibraryApiProvider client={client}>
        <ToastProvider>
          <Routes>
            <Route
              path={physioAppSpaRoutePath("exerciseDetail")}
              element={<ExerciseDetailsPage />}
            />
          </Routes>
        </ToastProvider>
      </ExerciseLibraryApiProvider>
    </MemoryRouter>,
  );
}

const baseDetails = {
  exercise_id: "ex-1",
  category: "Stretching" as const,
  body_regions: ["knee"],
  aliases: [],
  version_number: 1,
  in_my_exercises: true,
  favourite: false,
  library: {
    title: "Heel slide",
    description: "Desc",
    steps: "[]",
    equipment: null,
    precautions: null,
    cue_stretching: null,
    cue_isometric: null,
    cue_concentric: null,
    cue_eccentric: null,
  },
  resolved_text: [
    {
      key: "title",
      resolved: "Heel slide",
      library_value: "Heel slide",
      library_updated: false,
    },
  ],
};

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

  it("toggles pin through the client with an accessible pin control", async () => {
    const setPinned = vi.fn().mockResolvedValue({ ok: true });
    const listMyExercises = vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [
          {
            exercise_id: "ex-pin",
            exercise_name: "Bridge",
            category: "Strengthening",
            body_regions: ["hip"],
            matched_alias: null,
            edited: false,
            library_updated: false,
            favourite: false,
            saved_at: "2026-01-01T00:00:00Z",
            last_used_at: null,
            section: "pinned",
          },
        ],
        recently_used_and_saved: [],
      },
    });
    const client = mockClient({ listMyExercises, setPinned, searchApproved: vi.fn() });

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pin Bridge" })).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "Pin Bridge" }));
    expect(setPinned).toHaveBeenCalledWith("ex-pin", true);
  });

  it("opens exercise details from a card link", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [
            {
              exercise_id: "ex-open",
              exercise_name: "Open me",
              category: "Stretching",
              body_regions: ["knee"],
              matched_alias: null,
              edited: false,
              library_updated: false,
              favourite: false,
              saved_at: "2026-01-01T00:00:00Z",
              last_used_at: null,
              section: "recently_used_and_saved",
            },
          ],
        },
      }),
      searchApproved: vi.fn(),
      getExerciseDetails: vi.fn().mockResolvedValue({
        ...baseDetails,
        exercise_id: "ex-open",
        library: { ...baseDetails.library, title: "Open me" },
      }),
    });

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Open me/i })).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByRole("link", { name: /Open me/i }));

    await waitFor(() => {
      expect(client.getExerciseDetails).toHaveBeenCalledWith("ex-open");
    });
  });

  it("shows spec empty state when My exercises search matches nothing", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "nothing_in_my_exercises_matches",
        search_query: "zzzz",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      searchApproved: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: nothingInMyMatches("zzzz") }),
      ).toBeInTheDocument();
    });
  });

  it("shows filtered empty state copy on My exercises", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "no_saved_exercises_with_filters",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      searchApproved: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: NO_SAVED_WITH_FILTERS }),
      ).toBeInTheDocument();
    });
  });

  it("shows no exact match heading on All exercises search", async () => {
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
        exercises: [],
        next_cursor: null,
        search_link: null,
        total_count: 0,
      }),
    });

    render(
      <MemoryRouter
        initialEntries={[fillPhysioAppRoutePattern("exerciseSearch") + "?q=UniqueName"]}
      >
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: noExactMatchHeading("UniqueName") }),
      ).toBeInTheDocument();
    });
  });

  it("renders a visual-only busy state while loading", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            /* pending */
          }),
      ),
      searchApproved: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    const main = await screen.findByTestId("exercise-library-main");
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("exercise-library-busy-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    for (const phrase of UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS) {
      expect(screen.queryByText(phrase)).not.toBeInTheDocument();
    }
    assertLoadingErrorRegionsOnlyAllowlisted(
      main,
      LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
    );
  });

  it("does not show My exercises empty state copy when load fails", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockRejectedValue(new Error("network")),
      searchApproved: vi.fn(),
    });

    renderPhysio(fillPhysioAppRoutePattern("exercises"), client);

    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-list-error-slot"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(NO_SAVED_WITH_FILTERS)).not.toBeInTheDocument();
    expectLibraryErrorChrome(LIB_HEADING);
    assertExerciseLibraryErrorPageCopy(
      document.body,
      exerciseLibraryListErrorPageAllowlistMine(),
    );
  });

  it("does not show All exercises no-match or request form when load fails", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      searchApproved: vi.fn().mockRejectedValue(new Error("network")),
    });

    renderPhysio(`${fillPhysioAppRoutePattern("exerciseSearch")}?q=Missing`, client);

    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-list-error-slot"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(NOT_IN_LIBRARY_YET)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SUBMIT_REQUEST }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: noExactMatchHeading("Missing") }),
    ).not.toBeInTheDocument();
    expectLibraryErrorChrome(LIB_HEADING);
    assertExerciseLibraryErrorPageCopy(
      document.body,
      exerciseLibraryListErrorPageAllowlistAll(),
    );
  });

  it("renders the list error slot without unsourced copy when load fails", async () => {
    const client = mockClient({
      listMyExercises: vi.fn().mockRejectedValue(new Error("network")),
      searchApproved: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp exerciseLibraryClient={client} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-list-error-slot"),
      ).toBeInTheDocument();
    });
    for (const phrase of UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS) {
      expect(screen.queryByText(phrase)).not.toBeInTheDocument();
    }
    assertExerciseLibraryErrorPageCopy(
      document.body,
      exerciseLibraryListErrorPageAllowlistMine(),
    );
  });

  it("keeps Library back link, heading and app nav on details load error", async () => {
    const client = mockClient({
      getExerciseDetails: vi.fn().mockRejectedValue(new Error("network")),
    });

    renderPhysio(
      fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-1" }),
      client,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-detail-error-slot"),
      ).toBeInTheDocument();
    });
    expectLibraryErrorChrome(EXERCISE_DETAILS);
    assertExerciseLibraryErrorPageCopy(
      document.body,
      exerciseLibraryDetailsErrorPageAllowlist(),
    );
  });

  it("keeps Library back link, heading and app nav on My copy load error", async () => {
    const client = mockClient({
      getExerciseDetails: vi.fn().mockRejectedValue(new Error("network")),
    });

    renderPhysio(
      fillPhysioAppRoutePattern("exerciseMyCopy", { exerciseId: "ex-1" }),
      client,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-detail-error-slot"),
      ).toBeInTheDocument();
    });
    expectLibraryErrorChrome(MY_COPY);
    assertExerciseLibraryErrorPageCopy(
      document.body,
      exerciseLibraryMyCopyErrorPageAllowlist(),
    );
  });

  it("shows No edits yet when my copy has no overrides", async () => {
    const client = mockClient({
      getExerciseDetails: vi.fn().mockResolvedValue({
        ...baseDetails,
        in_my_exercises: true,
        favourite: false,
        resolved_text: [
          {
            key: "title",
            resolved: "Heel slide",
            library_value: "Heel slide",
            library_updated: false,
          },
        ],
        library: { ...baseDetails.library, title: "Heel slide" },
      }),
    });

    renderDetails(client);

    await waitFor(() => {
      expect(screen.getByText(NO_EDITS_YET)).toBeInTheDocument();
    });
  });

  it("shows Pinned prefix when favourite and no overrides", async () => {
    const client = mockClient({
      getExerciseDetails: vi.fn().mockResolvedValue({
        ...baseDetails,
        in_my_exercises: true,
        favourite: true,
        resolved_text: [
          {
            key: "title",
            resolved: "Heel slide",
            library_value: "Heel slide",
            library_updated: false,
          },
        ],
        library: { ...baseDetails.library, title: "Heel slide" },
      }),
    });

    renderDetails(client);

    await waitFor(() => {
      expect(screen.getByText(`${PINNED_PREFIX}${NO_EDITS_YET}`)).toBeInTheDocument();
    });
  });

  it("shows edits-on-top copy instead of No edits yet when overrides exist", async () => {
    const client = mockClient({
      getExerciseDetails: vi.fn().mockResolvedValue({
        ...baseDetails,
        in_my_exercises: true,
        resolved_text: [
          {
            key: "title",
            resolved: "My title",
            library_value: "Library title",
            library_updated: false,
          },
        ],
        library: { ...baseDetails.library, title: "Library title" },
      }),
    });

    renderDetails(client);

    await waitFor(() => {
      expect(screen.getByText(editsOnTopOfLibraryLine(1))).toBeInTheDocument();
    });
    expect(screen.queryByText(NO_EDITS_YET)).not.toBeInTheDocument();
  });

  it("omits the strength loop caption suffix on stretch exercises", async () => {
    const client = mockClient({
      getExerciseDetails: vi.fn().mockResolvedValue({
        ...baseDetails,
        category: "Stretching",
      }),
    });

    renderDetails(client);

    await waitFor(() => {
      expect(screen.getByText("Video, 6s loop")).toBeInTheDocument();
    });
    expect(
      screen.queryByText(MEDIA_LOOP_CAPTION_STRENGTH_SUFFIX),
    ).not.toBeInTheDocument();
  });

  it("remove from My exercises on details supports Undo", async () => {
    const undoPayload = {
      practitioner_id: "p-1",
      exercise_id: "ex-1",
      snapshot: {
        had_row: true,
        favourite: false,
        saved_at: "2026-01-01T00:00:00Z",
        last_used_at: null,
        text_overrides_json: "{}",
        param_overrides_json: "{}",
      },
    };
    const applyUndo = vi.fn().mockResolvedValue({ ok: true });
    const removeFromMyExercises = vi.fn().mockResolvedValue({ undo: undoPayload });
    const getExerciseDetails = vi.fn().mockResolvedValue(baseDetails);
    const client = mockClient({
      getExerciseDetails,
      removeFromMyExercises,
      applyUndo,
    });

    renderDetails(client);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
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
