/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import { HttpResponseError } from "../../src/ui/api/http-response-error.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  FAILED_KEEP_YOUR_VERSION,
  FAILED_MERGE_EXERCISES,
  FAILED_SWITCH_TO_LIBRARY,
  LIST_LOAD_ERROR_SECONDARY,
  REFRESH_FAILURE_PRIMARY,
  TRY_AGAIN,
  TRYING_AGAIN,
  BACK_TO_EXERCISES,
  failedRemoveItem,
  failedSaveItem,
  itemLoadErrorPrimary,
  listLoadErrorPrimary,
  loadingItemStatus,
  loadingListStatus,
  loadingListVisible,
  listTokenForSurface,
  notFoundHelper,
  notFoundTitle,
} from "../../src/ui/copy/shared-load-states.js";
import {
  didi1273FailedSaveMessage,
  mappedFailedSaveMessage,
} from "../../src/ui/shared-load-states/failed-save.js";
import {
  SharedItemLoadingState,
  SharedListLoadErrorBanner,
  SharedListLoadingState,
  SharedRefreshFailureBanner,
  sharedInitialLoadFailed,
  sharedRefreshFailed,
} from "../../src/ui/shared-load-states/SharedLoadStates.js";
import { isLoadNotFoundError } from "../../src/ui/shared-load-states/classify-load-error.js";
import { AUTO_SAVE_NOT_SAVED } from "../../src/ui/copy/programs.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
});

function mockClient(methods: Partial<ExerciseLibraryClient>): ExerciseLibraryClient {
  return methods as ExerciseLibraryClient;
}

function stubRequestsClient() {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
    listSimilar: vi.fn().mockResolvedValue({
      library_matches: [],
      drafts_in_progress: [],
    }),
  } as unknown as import("../../src/ui/api/exercise-requests-client.js").ExerciseRequestsClient;
}

describe("DIDI-1082 shared load states copy (pinned literals)", () => {
  it("pins list loading visible and screen reader status for all list surfaces", () => {
    expect(loadingListVisible("exercises")).toBe("Loading exercises...");
    expect(loadingListStatus("exercises")).toBe("Loading exercises");
    expect(loadingListVisible(listTokenForSurface("routines"))).toBe(
      "Loading routines...",
    );
    expect(loadingListStatus(listTokenForSurface("programs"))).toBe("Loading programs");
    expect(loadingListStatus(listTokenForSurface("requests"))).toBe(
      "Loading requests and drafts",
    );
    expect(loadingListStatus(listTokenForSurface("defaults"))).toBe(
      "Loading your defaults",
    );
  });

  it("pins item loading screen reader status", () => {
    expect(loadingItemStatus("exercise")).toBe("Loading exercise");
  });

  it("pins list and item load error strings", () => {
    expect(listLoadErrorPrimary("exercises")).toBe("Couldn't load exercises.");
    expect(itemLoadErrorPrimary("exercise")).toBe("Couldn't load this exercise.");
    expect(LIST_LOAD_ERROR_SECONDARY).toBe("Check your connection, then try again.");
  });

  it("pins refresh failure and retry control labels", () => {
    expect(REFRESH_FAILURE_PRIMARY).toBe(
      "Couldn't refresh. You're seeing what loaded earlier.",
    );
    expect(TRY_AGAIN).toBe("Try again");
    expect(TRYING_AGAIN).toBe("Trying again...");
  });

  it("pins not-found title, helper and back link", () => {
    expect(notFoundTitle("exercise")).toBe("This exercise isn't available.");
    expect(notFoundHelper("exercise")).toBe(
      "It may have been merged into another exercise.",
    );
    expect(BACK_TO_EXERCISES).toBe("Back to exercises");
  });

  it("pins FAILED_MERGE_EXERCISES literal", () => {
    expect(FAILED_MERGE_EXERCISES).toBe("Couldn't merge the exercises. Try again.");
    expect(didi1273FailedSaveMessage("exercise_merge")).toBe(FAILED_MERGE_EXERCISES);
  });

  it("pins locked failed-save strings for all four action types", () => {
    expect(mappedFailedSaveMessage({ kind: "save_or_edit", item: "exercise" })).toBe(
      failedSaveItem("exercise"),
    );
    expect(mappedFailedSaveMessage({ kind: "delete_or_remove", item: "program" })).toBe(
      failedRemoveItem("program"),
    );
    expect(mappedFailedSaveMessage({ kind: "switch_library_version" })).toBe(
      FAILED_SWITCH_TO_LIBRARY,
    );
    expect(mappedFailedSaveMessage({ kind: "keep_your_version" })).toBe(
      FAILED_KEEP_YOUR_VERSION,
    );
  });

  it("pins mapped failed-save strings for all ten known actions", () => {
    const locked = [
      mappedFailedSaveMessage({ kind: "save_or_edit", item: "exercise" }),
      mappedFailedSaveMessage({ kind: "save_or_edit", item: "exercise" }),
      mappedFailedSaveMessage({ kind: "delete_or_remove", item: "exercise" }),
      mappedFailedSaveMessage({ kind: "switch_library_version" }),
      mappedFailedSaveMessage({ kind: "keep_your_version" }),
      mappedFailedSaveMessage({ kind: "save_or_edit", item: "routine" }),
      mappedFailedSaveMessage({ kind: "save_or_edit", item: "routine" }),
      mappedFailedSaveMessage({ kind: "delete_or_remove", item: "routine" }),
      mappedFailedSaveMessage({ kind: "keep_your_version" }),
      mappedFailedSaveMessage({ kind: "delete_or_remove", item: "program" }),
    ];
    expect(new Set(locked)).toEqual(
      new Set([
        "Couldn't save the exercise. Try again.",
        "Couldn't remove the exercise. Try again.",
        "Couldn't switch to the library version. Try again.",
        "Couldn't keep your version. Try again.",
        "Couldn't save the routine. Try again.",
        "Couldn't remove the routine. Try again.",
        "Couldn't remove the program. Try again.",
      ]),
    );
  });
});

describe("DIDI-1082 shared load states behaviour", () => {
  it("applies refresh-failure only when cached content is present", () => {
    expect(sharedRefreshFailed(true, true)).toBe(true);
    expect(sharedRefreshFailed(false, true)).toBe(false);
    expect(sharedInitialLoadFailed(false, true)).toBe(true);
    expect(sharedInitialLoadFailed(true, true)).toBe(false);
  });

  it("classifies not_found errors for not-found UI", () => {
    expect(isLoadNotFoundError({ code: "exercise_not_found" })).toBe(true);
    expect(isLoadNotFoundError(new Error("routine_not_found"))).toBe(true);
    expect(isLoadNotFoundError(new Error("network"))).toBe(false);
    expect(
      isLoadNotFoundError(
        new HttpResponseError("Exercise not found", {
          code: "exercise_not_found",
          status: 404,
        }),
      ),
    ).toBe(true);
    expect(
      isLoadNotFoundError(
        new HttpResponseError("Exercise not found", {
          status: 500,
        }),
      ),
    ).toBe(true);
  });

  it("renders SharedListLoadingState with visible loading copy, sr-only status without ellipsis, and aria-hidden skeleton list", () => {
    render(
      <SharedListLoadingState surface="programs" testId="programs-list-loading" />,
    );
    const root = screen.getByTestId("programs-list-loading");
    expect(
      within(root).getByText(loadingListVisible(listTokenForSurface("programs"))),
    ).toBeInTheDocument();
    const status = within(root).getByRole("status");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveTextContent(
      loadingListStatus(listTokenForSurface("programs")),
    );
    expect(status.textContent).not.toMatch(/\.\.\.$/);
    expect(within(root).getByTestId("sls-skeleton-list")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("renders refresh banner without inventing a secondary line", () => {
    const onTryAgain = vi.fn();
    render(
      <div style={{ maxWidth: 390 }}>
        <SharedRefreshFailureBanner onTryAgain={onTryAgain} testId="refresh-banner" />
      </div>,
    );
    const banner = screen.getByTestId("refresh-banner");
    expect(within(banner).getByText(REFRESH_FAILURE_PRIMARY)).toBeInTheDocument();
    expect(
      within(banner).queryByText(LIST_LOAD_ERROR_SECONDARY),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("renders list error banner at 1280px content width", () => {
    render(
      <div style={{ maxWidth: 1280 }}>
        <SharedListLoadErrorBanner
          surface="exercises"
          onTryAgain={() => {}}
          testId="list-banner"
        />
      </div>,
    );
    const banner = screen.getByTestId("list-banner");
    expect(
      within(banner).getByText(listLoadErrorPrimary(listTokenForSurface("exercises"))),
    ).toBeInTheDocument();
    expect(within(banner).getByText(LIST_LOAD_ERROR_SECONDARY)).toBeInTheDocument();
  });

  it("re-requests the list when Try again is pressed after a list load error", async () => {
    const listMyExercises = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      });
    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp
          exerciseLibraryClient={mockClient({
            listMyExercises,
            searchApproved: vi.fn(),
          })}
          exerciseRequestsClient={stubRequestsClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    await waitFor(() => {
      expect(listMyExercises).toHaveBeenCalledTimes(2);
    });
  });

  it("shows not-found card when details load returns HttpResponseError exercise_not_found", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-missing" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({
            getExerciseDetails: vi.fn().mockRejectedValue(
              new HttpResponseError("Exercise not found", {
                code: "exercise_not_found",
                status: 404,
              }),
            ),
          })}
          exerciseRequestsClient={stubRequestsClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("exercise"))).toBeInTheDocument();
    });
    expect(screen.getByText(notFoundHelper("exercise"))).toBeInTheDocument();
    expect(
      screen.queryByText(itemLoadErrorPrimary("exercise")),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: TRY_AGAIN })).not.toBeInTheDocument();
  });

  it("shows not-found card when details load returns not_found", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-missing" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({
            getExerciseDetails: vi
              .fn()
              .mockRejectedValue(new Error("exercise_not_found")),
          })}
          exerciseRequestsClient={stubRequestsClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("exercise"))).toBeInTheDocument();
    });
    expect(screen.getByText(notFoundHelper("exercise"))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: TRY_AGAIN })).not.toBeInTheDocument();
  });

  it("shows item load error banner copy on exercise details", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-1" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({
            getExerciseDetails: vi.fn().mockRejectedValue(new Error("network")),
          })}
          exerciseRequestsClient={stubRequestsClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-detail-error-slot"),
      ).toBeInTheDocument();
    });
    const banner = screen.getByTestId("exercise-library-detail-error-slot");
    expect(
      within(banner).getByText(itemLoadErrorPrimary("exercise")),
    ).toBeInTheDocument();
    expect(within(banner).getByText(LIST_LOAD_ERROR_SECONDARY)).toBeInTheDocument();
  });

  it("uses DIDI-1273 program builder autosave copy when autosave fails (DIDI-1273)", () => {
    expect(failedSaveItem("program")).toBe("Couldn't save the program. Try again.");
    expect(AUTO_SAVE_NOT_SAVED).toBe("Not saved");
  });

  it("exposes item loading status to screen readers while skeleton stays aria-hidden", () => {
    render(<SharedItemLoadingState surface="exercises" testId="item-loading" />);
    const root = screen.getByTestId("item-loading");
    expect(within(root).getByRole("status")).toHaveTextContent(
      loadingItemStatus("exercise"),
    );
    expect(within(root).getByTestId("sls-item-skeleton-bars")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("does not expose loading item status on exercise details when initial load failed", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-1" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({
            getExerciseDetails: vi.fn().mockRejectedValue(new Error("network")),
          })}
          exerciseRequestsClient={stubRequestsClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-detail-error-slot"),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("status", { name: loadingItemStatus("exercise") }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(loadingItemStatus("exercise"))).not.toBeInTheDocument();
  });

  it("shows Trying again while an async list retry is in flight", async () => {
    let resolve!: () => void;
    const onTryAgain = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolve = res;
        }),
    );
    render(
      <SharedListLoadErrorBanner
        surface="exercises"
        onTryAgain={onTryAgain}
        testId="retry-banner"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    resolve();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: TRY_AGAIN }),
    );
  });

  it("uses role alert on load error banners", () => {
    render(<SharedListLoadingState surface="routines" testId="list-loading" />);
    render(
      <SharedListLoadErrorBanner
        surface="defaults"
        onTryAgain={() => {}}
        testId="defaults-banner"
      />,
    );
    expect(screen.getByTestId("defaults-banner")).toHaveAttribute("role", "alert");
  });

  it("hides list loading visible text when initial list load fails", async () => {
    const listMyExercises = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("exercises")]}>
        <PhysioApp
          exerciseLibraryClient={mockClient({
            listMyExercises,
            searchApproved: vi.fn(),
          })}
          exerciseRequestsClient={stubRequestsClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByText(listLoadErrorPrimary(listTokenForSurface("exercises"))),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(loadingListVisible(listTokenForSurface("exercises"))),
    ).not.toBeInTheDocument();
  });

  it("hides programs list loading visible text when initial list load fails", async () => {
    const listPrograms = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={mockClient({
            listMyExercises: vi.fn(),
            searchApproved: vi.fn(),
          })}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={
            {
              listPrograms,
              listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByText(listLoadErrorPrimary(listTokenForSurface("programs"))),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(loadingListVisible(listTokenForSurface("programs"))),
    ).not.toBeInTheDocument();
  });

  it("shows Trying again on programs list banner while async retry is in flight", async () => {
    let resolve!: () => void;
    const onTryAgain = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolve = res;
        }),
    );
    render(
      <SharedListLoadErrorBanner
        surface="programs"
        onTryAgain={onTryAgain}
        testId="programs-retry-banner"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    resolve();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
    });
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});
