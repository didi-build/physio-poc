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
import {
  ExerciseMediaClient,
  setExerciseMediaClientForTests,
} from "../../src/ui/api/exercise-media-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import { HttpResponseError } from "../../src/ui/api/http-response-error.js";
import type { MyDefaultsClient } from "../../src/ui/api/my-defaults-client.js";
import { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { programByCodePath } from "../../src/programs-api-paths.js";
import {
  RoutinesClient,
  setRoutinesClientForTests,
} from "../../src/ui/api/routines-client.js";
import { exerciseLibraryExerciseDetailsPath } from "../../src/exercise-library-api-paths.js";
import {
  exerciseRequestPath,
  exerciseRequestsInProgressCountPath,
} from "../../src/exercise-requests-api-paths.js";
import {
  EXERCISE_MEDIA_REGENERATION_QUOTA_PATH,
  exerciseMediaRegeneratePath,
} from "../../src/exercise-media-api-paths.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { PRESCRIPTION_TYPES } from "../../src/domain/exercise-types.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import { ExerciseLibraryApiProvider } from "../../src/ui/api/exercise-library-context.js";
import {
  APPROVE,
  REGENERATE,
  REGENERATE_IMAGES,
} from "../../src/ui/copy/exercise-requests.js";
import {
  SAVE,
  TYPE_LABELS,
  editYourTypeDefaultLabel,
} from "../../src/ui/copy/my-defaults.js";
import { PUBLISH_NOW, PUBLISH_SHEET_TITLE } from "../../src/ui/copy/program-publish.js";
import {
  NEW_PROGRAM_FROM_ROUTINE,
  NEW_PROGRAM_ROUTINE_PICKER_TITLE,
  NEW_PROGRAM_SHEET_TITLE,
} from "../../src/ui/copy/programs.js";
import { PublishSheet } from "../../src/ui/programs/PublishSheet.js";
import { AddExerciseSheet } from "../../src/ui/programs/AddExerciseSheet.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import type { ProgramShareConnectorView } from "../../src/services/programs/program-publish-service.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";
import { FAKE_UI_PRACTITIONER_ID } from "./fake-practitioner-session-fixture.js";
import {
  FAILED_KEEP_YOUR_VERSION,
  FAILED_MERGE_EXERCISES,
  FAILED_SWITCH_TO_LIBRARY,
  LIST_LOAD_ERROR_SECONDARY,
  REFRESH_FAILURE_PRIMARY,
  TRY_AGAIN,
  TRYING_AGAIN,
  BACK_TO_EXERCISES,
  BACK_TO_PROGRAMS,
  BACK_TO_ROUTINES,
  BACK_TO_REQUESTS_AND_DRAFTS,
  NOT_FOUND_HELPER_DRAFT,
  NOT_FOUND_HELPER_PROGRAM,
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
  setExerciseRequestsClientForTests(null);
  setExerciseMediaClientForTests(null);
  setRoutinesClientForTests(null);
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

function stubLibraryListClient(): ExerciseLibraryClient {
  return mockClient({
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
}

describe("DIDI-1082 shared load states copy (pinned literals)", () => {
  it("pins list loading visible and screen reader status for all list surfaces", () => {
    expect(loadingListVisible("exercises")).toBe("Loading exercises...");
    expect(loadingListStatus("exercises")).toBe("Loading exercises");
    expect(loadingListStatus("exercises")).not.toMatch(/\.\.\.$/);
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
    expect(NOT_FOUND_HELPER_PROGRAM).toBe(
      "It may have been deleted. Deleted programs stay in Recently deleted for 30 days.",
    );
    expect(NOT_FOUND_HELPER_DRAFT).toBe(
      "It may have been approved or discarded. Approved exercises are in My exercises.",
    );
    expect(BACK_TO_EXERCISES).toBe("Back to exercises");
    expect(BACK_TO_REQUESTS_AND_DRAFTS).toBe("Back to requests and drafts");
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

  it("B2c: programs list initial load failure keeps busy skeleton placeholders aria-hidden", async () => {
    const listPrograms = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryListClient()}
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
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
    });
    expect(screen.getByTestId("programs-list-busy-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(listPrograms).toHaveBeenCalledTimes(1);
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
    const slot = screen.getByTestId("exercise-library-detail-error-slot");
    const back = within(slot).getByRole("link", { name: BACK_TO_EXERCISES });
    expect(back).toHaveAttribute("href", fillPhysioAppRoutePattern("exercises"));
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
    const slot = screen.getByTestId("exercise-library-detail-error-slot");
    const back = within(slot).getByRole("link", { name: BACK_TO_EXERCISES });
    expect(back).toHaveAttribute("href", fillPhysioAppRoutePattern("exercises"));
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
    expect(screen.getByTestId("exercise-library-detail-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("does not expose loading item status on my copy when initial load failed (C1)", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("exerciseMyCopy", { exerciseId: "ex-1" }),
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
    expect(screen.queryByText(loadingItemStatus("exercise"))).not.toBeInTheDocument();
    expect(screen.getByTestId("exercise-library-mycopy-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("does not expose loading item status on routine details when initial load failed (C1)", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("routineDetail", { routineId: "rt-1" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={stubRequestsClient()}
          routinesClient={
            {
              getRoutineDetails: vi.fn().mockRejectedValue(new Error("network")),
            } as unknown as RoutinesClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("exercise-library-detail-error-slot"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(loadingItemStatus("routine"))).not.toBeInTheDocument();
    expect(screen.getByTestId("exercise-library-busy-skeleton")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("shows not-found on routine details when load fails with not_found", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("routineDetail", { routineId: "rt-missing" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={stubRequestsClient()}
          routinesClient={
            {
              getRoutineDetails: vi
                .fn()
                .mockRejectedValue(new Error("routine_not_found")),
            } as unknown as RoutinesClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("routine"))).toBeInTheDocument();
    });
    const slot = screen.getByTestId("exercise-library-detail-error-slot");
    const back = within(slot).getByRole("link", { name: BACK_TO_ROUTINES });
    expect(back).toHaveAttribute("href", fillPhysioAppRoutePattern("routines"));
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

  it("shows not-found on draft review when request load fails with not_found (not skeleton forever)", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-missing" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={
            {
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listSimilar: vi.fn().mockResolvedValue({
                library_matches: [],
                drafts_in_progress: [],
              }),
              getRequest: vi.fn().mockRejectedValue(new Error("request_not_found")),
            } as unknown as ExerciseRequestsClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("draft"))).toBeInTheDocument();
    });
    expect(screen.getByText(NOT_FOUND_HELPER_DRAFT)).toBeInTheDocument();
    const slot = screen.getByTestId("exercise-request-detail-error-slot");
    const back = within(slot).getByRole("link", { name: BACK_TO_REQUESTS_AND_DRAFTS });
    expect(back).toHaveAttribute("href", fillPhysioAppRoutePattern("requests"));
    expect(screen.queryByRole("button", { name: TRY_AGAIN })).not.toBeInTheDocument();
    expect(screen.queryByText(itemLoadErrorPrimary("draft"))).not.toBeInTheDocument();
  });

  it("B11 void mutant killer: draft review item load Try again shows Trying again while refresh promise is in flight", async () => {
    const draftView = {
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting" as const,
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "kojo@example.com",
      exercise_id: "ex-1",
      draft: {
        exercise_version_id: "ver-1",
        version_number: 1,
        title: "Heel slide",
        description: "Desc",
        equipment: "",
        starting_position: "",
        steps: "",
        common_mistakes: "",
        regressions: "",
        progressions: "",
        precautions: "",
        cue_stretching: null,
        cue_isometric: null,
        cue_concentric: null,
        cue_eccentric: null,
      },
    };
    let resolveHang!: (value: typeof draftView) => void;
    const hang = new Promise<typeof draftView>((resolve) => {
      resolveHang = resolve;
    });
    const getRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(() => hang);

    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-1" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={
            {
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listSimilar: vi.fn().mockResolvedValue({
                library_matches: [],
                drafts_in_progress: [],
              }),
              getRequest,
            } as unknown as ExerciseRequestsClient
          }
          exerciseMediaClient={
            {
              getRegenerationQuota: vi.fn().mockResolvedValue({
                limit: 5,
                used: 0,
                remaining: 5,
                limitReached: false,
              }),
            } as unknown as ExerciseMediaClient
          }
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    resolveHang(draftView);
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: TRYING_AGAIN }),
      ).not.toBeInTheDocument();
    });
    expect(getRequest).toHaveBeenCalledTimes(2);
  });

  it("shows not-found on program builder when program load fails with not_found", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("programBuilder", { programCode: "PRG-MISS" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={
            {
              getProgramByCode: vi
                .fn()
                .mockRejectedValue(new Error("program_not_found")),
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("program"))).toBeInTheDocument();
    });
    expect(screen.getByText(NOT_FOUND_HELPER_PROGRAM)).toBeInTheDocument();
    const slot = screen.getByTestId("programs-builder-error-slot");
    const back = within(slot).getByRole("link", { name: BACK_TO_PROGRAMS });
    expect(back).toHaveAttribute("href", fillPhysioAppRoutePattern("programs"));
    expect(slot).toHaveTextContent(notFoundTitle("program"));
  });

  it("B10e: program builder item load error Try again calls refresh twice with Trying again while pending", async () => {
    let rejectHang!: (error: Error) => void;
    const getProgramByCode = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementationOnce(
        () =>
          new Promise<ProgramBuilderView>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("programBuilder", { programCode: "PRG-TEST" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={stubLibraryListClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={
            {
              getProgramByCode,
            } as unknown as ProgramsClient
          }
        />
      </MemoryRouter>,
    );
    const slot = await screen.findByTestId("programs-builder-error-slot");
    await waitFor(() => {
      expect(within(slot).getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
    });
    await userEvent.click(within(slot).getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    expect(screen.getByTestId("programs-builder-error-slot")).toBeInTheDocument();
    rejectHang(new Error("fail again"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: TRY_AGAIN }),
    );
    expect(getProgramByCode).toHaveBeenCalledTimes(2);
  });

  it("shows not-found card when ExerciseLibraryClient details fetch returns 404 JSON", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : input.url;
      if (path.includes("/api/me/exercises/")) {
        return new Response(JSON.stringify({ message: "Exercise not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    const client = new ExerciseLibraryClient({ fetchFn });
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("exerciseDetail", { exerciseId: "ex-missing" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={client}
          exerciseRequestsClient={stubRequestsClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("exercise"))).toBeInTheDocument();
    });
    expect(
      screen.queryByText(itemLoadErrorPrimary("exercise")),
    ).not.toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith(
      exerciseLibraryExerciseDetailsPath("ex-missing"),
      expect.anything(),
    );
  });

  it("shows not-found on draft review when ExerciseRequestsClient fetch returns 404 JSON", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : input.url;
      if (path === exerciseRequestsInProgressCountPath()) {
        return new Response(JSON.stringify({ in_progress_count: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (path === exerciseRequestPath("req-missing")) {
        return new Response(JSON.stringify({ message: "Request not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    });
    const requestsClient = new ExerciseRequestsClient({ fetchFn });
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-missing" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={requestsClient}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("draft"))).toBeInTheDocument();
    });
    expect(screen.queryByText(itemLoadErrorPrimary("draft"))).not.toBeInTheDocument();
  });

  it("shows not-found on program builder when ProgramsClient fetch returns 404 JSON", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : input.url;
      if (path === programByCodePath("PRG-MISS")) {
        return new Response(JSON.stringify({ message: "Program not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    });
    const programsClient = new ProgramsClient({ fetchFn });
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("programBuilder", { programCode: "PRG-MISS" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={programsClient}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(notFoundTitle("program"))).toBeInTheDocument();
    });
    expect(
      screen.getAllByRole("link", { name: BACK_TO_PROGRAMS }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(itemLoadErrorPrimary("program"))).not.toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith(
      programByCodePath("PRG-MISS"),
      expect.anything(),
    );
  });

  it.each([
    {
      surface: "exercises" as const,
      route: fillPhysioAppRoutePattern("exercises"),
      token: listTokenForSurface("exercises"),
      hangResolveValue: {
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      },
      renderApp: (hangFn: ReturnType<typeof vi.fn>) => (
        <PhysioApp
          exerciseLibraryClient={mockClient({
            listMyExercises: hangFn as ExerciseLibraryClient["listMyExercises"],
            searchApproved: vi.fn(),
          })}
          exerciseRequestsClient={stubRequestsClient()}
        />
      ),
    },
    {
      surface: "programs" as const,
      route: "/programs",
      token: listTokenForSurface("programs"),
      hangResolveValue: { items: [], matched_code: null },
      renderApp: (hangFn: ReturnType<typeof vi.fn>) => (
        <PhysioApp
          exerciseLibraryClient={stubLibraryListClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={
            {
              listPrograms: hangFn,
              listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
            } as unknown as ProgramsClient
          }
        />
      ),
    },
    {
      surface: "routines" as const,
      route: fillPhysioAppRoutePattern("routines"),
      token: listTokenForSurface("routines"),
      hangResolveValue: {
        routines: [],
        total_count: 0,
        conditions_available: false,
        condition_options: [],
      },
      renderApp: (hangFn: ReturnType<typeof vi.fn>) => (
        <PhysioApp
          exerciseLibraryClient={stubLibraryListClient()}
          exerciseRequestsClient={stubRequestsClient()}
          routinesClient={
            {
              searchCommunity: hangFn,
              listMyRoutines: vi.fn(),
            } as unknown as RoutinesClient
          }
        />
      ),
    },
    {
      surface: "requests" as const,
      route: fillPhysioAppRoutePattern("requests"),
      token: listTokenForSurface("requests"),
      hangResolveValue: { requests: [], in_progress_count: 0 },
      renderApp: (hangFn: ReturnType<typeof vi.fn>) => (
        <PhysioApp
          exerciseLibraryClient={mockClient({ listMyExercises: vi.fn() })}
          exerciseRequestsClient={
            {
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listSimilar: vi.fn().mockResolvedValue({
                library_matches: [],
                drafts_in_progress: [],
              }),
              listInProgress: hangFn,
            } as unknown as ExerciseRequestsClient
          }
        />
      ),
    },
    {
      surface: "defaults" as const,
      route: fillPhysioAppRoutePattern("defaults"),
      token: listTokenForSurface("defaults"),
      hangResolveValue: {
        share_link_expiry: {
          global: {
            expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
            customExpiresOn: null,
          },
          practitioner: null,
          effective: {
            expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
            customExpiresOn: null,
          },
        },
        exercise_types: PRESCRIPTION_TYPES.map((type) => ({
          type,
          global_params: GLOBAL_TYPE_DEFAULTS_SEED[type],
          practitioner_params: null,
        })),
      },
      renderApp: (hangFn: ReturnType<typeof vi.fn>) => (
        <PhysioApp
          exerciseLibraryClient={stubLibraryListClient()}
          exerciseRequestsClient={stubRequestsClient()}
          myDefaultsClient={
            {
              getPage: hangFn,
              updateShareLinkExpiry: vi.fn(),
              upsertTypeDefault: vi.fn(),
              resetTypeDefault: vi.fn(),
            } as unknown as MyDefaultsClient
          }
        />
      ),
    },
  ])(
    "B1: $surface list Try again shows Trying again without loading visible text during retry",
    async ({ route, token, hangResolveValue, renderApp }) => {
      let resolveHang!: () => void;
      const hang = new Promise<unknown>((resolve) => {
        resolveHang = () => resolve(hangResolveValue);
      });
      const hangFn = vi
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockImplementation(() => hang);

      render(<MemoryRouter initialEntries={[route]}>{renderApp(hangFn)}</MemoryRouter>);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
      });
      await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
      expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
      expect(screen.queryByText(loadingListVisible(token))).not.toBeInTheDocument();
      resolveHang();
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: TRYING_AGAIN }),
        ).not.toBeInTheDocument();
      });
    },
  );

  it("B1pk: PickRoutineForProgramSheet list load retry shows Trying again", async () => {
    let rejectHang!: (error: Error) => void;
    const searchCommunity = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectHang = reject;
          }),
      );
    const listMyRoutines = vi.fn().mockResolvedValue({
      drafts: [],
      saved: [],
      flagged_count: 0,
      conditions_available: false,
      condition_options: [],
    });
    render(
      <MemoryRouter initialEntries={["/programs/new"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryListClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={
            {
              listPrograms: vi
                .fn()
                .mockResolvedValue({ items: [], matched_code: null }),
              listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
            } as unknown as ProgramsClient
          }
          routinesClient={
            {
              searchCommunity,
              listMyRoutines,
            } as unknown as RoutinesClient
          }
        />
      </MemoryRouter>,
    );
    const chooser = await screen.findByRole("dialog", {
      name: NEW_PROGRAM_SHEET_TITLE,
    });
    await userEvent.click(
      within(chooser).getByRole("button", {
        name: new RegExp(NEW_PROGRAM_FROM_ROUTINE),
      }),
    );
    const picker = await screen.findByRole("dialog", {
      name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
    });
    await waitFor(() => {
      expect(
        within(picker).getByRole("button", { name: TRY_AGAIN }),
      ).toBeInTheDocument();
    });
    await userEvent.click(within(picker).getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    expect(
      screen.queryByText(loadingListVisible(listTokenForSurface("routines"))),
    ).not.toBeInTheDocument();
    rejectHang(new Error("network"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
    });
    expect(searchCommunity).toHaveBeenCalledTimes(2);
    expect(listMyRoutines).toHaveBeenCalledTimes(2);
  });

  it("B1: AddExerciseSheet list Try again shows Trying again without loading visible text", async () => {
    let resolveHang!: (value: unknown) => void;
    const hang = new Promise<unknown>((resolve) => {
      resolveHang = resolve;
    });
    const listMyExercises = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(() => hang);

    render(
      <NavigationTestProviders>
        <ExerciseLibraryApiProvider
          client={
            {
              listMyExercises,
              searchApproved: vi.fn(),
            } as unknown as ExerciseLibraryClient
          }
        >
          <AddExerciseSheet open onClose={() => {}} onPickExercise={() => {}} />
        </ExerciseLibraryApiProvider>
      </NavigationTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    expect(
      screen.queryByText(loadingListVisible(listTokenForSurface("exercises"))),
    ).not.toBeInTheDocument();
    resolveHang({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [],
        recently_used_and_saved: [],
      },
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: TRYING_AGAIN }),
      ).not.toBeInTheDocument();
    });
  });

  it("DraftReview approve retry calls approveRequest API twice on Try again", async () => {
    const draftView = {
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting" as const,
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "kojo@example.com",
      exercise_id: "ex-1",
      draft: {
        exercise_version_id: "ver-1",
        version_number: 1,
        title: "Heel slide",
        description: "Desc",
        equipment: "",
        starting_position: "",
        steps: "",
        common_mistakes: "",
        regressions: "",
        progressions: "",
        precautions: "",
        cue_stretching: null,
        cue_isometric: null,
        cue_concentric: null,
        cue_eccentric: null,
      },
    };
    const approveRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail again"));

    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-1" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={
            {
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listSimilar: vi.fn().mockResolvedValue({
                library_matches: [],
                drafts_in_progress: [],
              }),
              getRequest: vi.fn().mockResolvedValue(draftView),
              approveRequest,
            } as unknown as ExerciseRequestsClient
          }
          exerciseMediaClient={
            {
              getRegenerationQuota: vi.fn().mockResolvedValue({
                limit: 5,
                used: 0,
                remaining: 5,
                limitReached: false,
              }),
            } as unknown as ExerciseMediaClient
          }
        />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole("button", { name: APPROVE }));
    await waitFor(() => {
      expect(
        screen.getByTestId("request-approve-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    await waitFor(() => {
      expect(approveRequest).toHaveBeenCalledTimes(2);
    });
  });

  it("PublishSheet runPublish retry calls publishProgram again after network error", async () => {
    const publishProgram = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ published_at: "2026-01-01T00:00:00.000Z" });
    const program: ProgramBuilderView = {
      program_id: "p1",
      code: "PRG-7K3Q",
      name: "Knee rehab",
      created_at: "2026-10-24T12:00:00.000Z",
      draft_updated_at: "2026-10-24T12:00:00.000Z",
      auto_save_status: { kind: "not_published_yet" },
      draft_saved_at: "2026-10-24T12:00:00.000Z",
      exercise_count: 1,
      library_updates_to_review: 0,
      rows: [
        {
          id: "r1",
          position: 0,
          kind: "exercise",
          exercise_id: "ex1",
          exercise_version_id: "v1",
          exercise_request_id: null,
          pinned_version_number: 1,
          prescription_type: "stretching",
          params: { hold_s: 30 },
          params_source: "global_defaults",
          resolved_params: { hold_s: 30 },
          resolved_params_source: "global_defaults",
          text_snapshot: { title: "Heel slide" },
          note: null,
          library_update: null,
          exercise_version_choices: [],
        },
      ],
      open_share_link: false,
      share_link_status: "none",
      last_sent_at: null,
      deleted_at: null,
      routine_origin: null,
    };
    const shareView: ProgramShareConnectorView = {
      display_state: "draft_only",
      share_link: "",
      share_link_status: "none",
      share_link_state: "none",
      expires_at: null,
      open_share_link: false,
      draft: { version: 1, updated_at: "2026-10-24T12:00:00.000Z" },
      published: null,
      program_code: "PRG-7K3Q",
      program_name: "Knee rehab",
      link_expires_in: null,
      link_expires_on: null,
      practitioner_default_expires_in: "1_year",
      publish_change_lines: [],
      published_at: null,
    };
    render(
      <MemoryRouter>
        <PublishSheet
          open
          program={program}
          shareView={shareView}
          client={
            {
              publishProgram,
              updateProgramName: vi.fn(),
            } as unknown as ProgramsClient
          }
          nameDraft="Knee rehab"
          showNameField={false}
          onNameChange={() => {}}
          onProgramUpdated={() => {}}
          onClose={() => {}}
          onPublished={() => {}}
          onNotYet={() => {}}
          onRemovePlaceholder={() => {}}
        />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog", { name: PUBLISH_SHEET_TITLE });
    await userEvent.click(within(dialog).getByRole("button", { name: PUBLISH_NOW }));
    await waitFor(() => {
      expect(
        screen.getByTestId("program-publish-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await userEvent.click(within(dialog).getByRole("button", { name: TRY_AGAIN }));
    await waitFor(() => {
      expect(publishProgram).toHaveBeenCalledTimes(2);
    });
  });

  it("MyDefaults type-default Try again success clears failed-save alert", async () => {
    const upsertTypeDefault = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ params: GLOBAL_TYPE_DEFAULTS_SEED.stretching });

    render(
      <MemoryRouter initialEntries={[fillPhysioAppRoutePattern("defaults")]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryListClient()}
          exerciseRequestsClient={stubRequestsClient()}
          myDefaultsClient={
            {
              getPage: vi.fn().mockResolvedValue({
                share_link_expiry: {
                  global: {
                    expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
                    customExpiresOn: null,
                  },
                  practitioner: null,
                  effective: {
                    expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
                    customExpiresOn: null,
                  },
                },
                exercise_types: PRESCRIPTION_TYPES.map((type) => ({
                  type,
                  global_params: GLOBAL_TYPE_DEFAULTS_SEED[type],
                  practitioner_params:
                    type === "stretching"
                      ? { hold_s: 30, per_day: 2, days_per_week: 3 }
                      : null,
                })),
              }),
              updateShareLinkExpiry: vi.fn(),
              upsertTypeDefault,
              resetTypeDefault: vi.fn(),
            } as unknown as MyDefaultsClient
          }
        />
      </MemoryRouter>,
    );

    const card = await screen.findByTestId("type-default-stretching");
    await userEvent.click(
      within(card).getByRole("button", {
        name: editYourTypeDefaultLabel(TYPE_LABELS.stretching),
      }),
    );
    const holdInput = within(card).getByRole("textbox", { name: "Hold in seconds" });
    await userEvent.clear(holdInput);
    await userEvent.type(holdInput, "50");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));
    await waitFor(() => {
      expect(
        screen.getByTestId("defaults-exercise-type-failed-save-alert"),
      ).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    await waitFor(() => {
      expect(
        screen.queryByTestId("defaults-exercise-type-failed-save-alert"),
      ).not.toBeInTheDocument();
    });
  });

  it("DraftReview daily_limit_reached from media client does not show regenerate failed-save alert", async () => {
    const draftView = {
      request_id: "req-1",
      requested_name: "Heel slide",
      exercise_note: null,
      status: "drafting" as const,
      requested_by: FAKE_UI_PRACTITIONER_ID,
      requested_by_email: "kojo@example.com",
      exercise_id: "ex-1",
      draft: {
        exercise_version_id: "ver-1",
        version_number: 1,
        title: "Heel slide",
        description: "Desc",
        equipment: "",
        starting_position: "",
        steps: "",
        common_mistakes: "",
        regressions: "",
        progressions: "",
        precautions: "",
        cue_stretching: null,
        cue_isometric: null,
        cue_concentric: null,
        cue_eccentric: null,
      },
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : input.url;
      if (path === EXERCISE_MEDIA_REGENERATION_QUOTA_PATH) {
        return new Response(
          JSON.stringify({
            limit: 5,
            used: 0,
            remaining: 5,
            limitReached: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (init?.method === "POST" && path === exerciseMediaRegeneratePath("ver-1")) {
        return new Response(
          JSON.stringify({
            message: "Daily limit reached",
            error: "daily_limit_reached",
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "Not found" }), { status: 404 });
    });
    const mediaClient = new ExerciseMediaClient({ fetchFn });

    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("requestReview", { requestId: "req-1" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={mockClient({})}
          exerciseRequestsClient={
            {
              getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
              listSimilar: vi.fn().mockResolvedValue({
                library_matches: [],
                drafts_in_progress: [],
              }),
              getRequest: vi.fn().mockResolvedValue(draftView),
            } as unknown as ExerciseRequestsClient
          }
          exerciseMediaClient={mediaClient}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: REGENERATE })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: REGENERATE }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: REGENERATE_IMAGES }),
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId("request-regenerate-media-failed-save-alert"),
      ).not.toBeInTheDocument();
    });
  });
});
