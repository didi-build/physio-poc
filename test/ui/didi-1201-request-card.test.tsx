/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  LIB_TAB_ALL,
  REQUEST_HEADING,
  SUBMIT_REQUEST,
  TRY_ALL_OR_REQUEST,
} from "../../src/ui/copy/exercise-library.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
});

function emptyAllLibraryClient(): ExerciseLibraryClient {
  return {
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
  } as unknown as ExerciseLibraryClient;
}

function stubRequests(): ExerciseRequestsClient {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
    listSimilar: vi.fn().mockResolvedValue({
      library_matches: [],
      drafts_in_progress: [],
    }),
    submitRequest: vi.fn().mockResolvedValue({
      outcome: "created",
      request_id: "req-1",
      status: "drafting",
      exercise_id: "ex-1",
    }),
  } as unknown as ExerciseRequestsClient;
}

function renderAllExercises(
  entry: string,
  library: ExerciseLibraryClient,
  requests: ExerciseRequestsClient = stubRequests(),
) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PhysioApp exerciseLibraryClient={library} exerciseRequestsClient={requests} />
    </MemoryRouter>,
  );
}

describe("DIDI-1201 request card on All exercises empty states", () => {
  it("shows the request card when All exercises has zero results and no search (state 2)", async () => {
    renderAllExercises(
      fillPhysioAppRoutePattern("exerciseSearch"),
      emptyAllLibraryClient(),
    );

    await waitFor(() => {
      expect(screen.getByTestId("exercise-request-card")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: REQUEST_HEADING })).toBeInTheDocument();
    expect(screen.getByLabelText("Exercise")).toHaveValue("");
  });

  it("shows the request card when a search has no exact match (state 1)", async () => {
    const library = {
      ...emptyAllLibraryClient(),
      searchApproved: vi.fn().mockResolvedValue({
        exercises: [],
        next_cursor: null,
        search_link: null,
        total_count: 0,
      }),
    } as unknown as ExerciseLibraryClient;

    renderAllExercises(
      `${fillPhysioAppRoutePattern("exerciseSearch")}?q=UniqueName`,
      library,
    );

    await waitFor(() => {
      expect(screen.getByTestId("exercise-request-card")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Exercise")).toHaveValue("UniqueName");
  });

  it("shows the request card when filters match nothing (state 3)", async () => {
    const searchApproved = vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    });
    const library = {
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "ok",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      searchApproved,
    } as unknown as ExerciseLibraryClient;

    renderAllExercises(fillPhysioAppRoutePattern("exerciseSearch"), library);

    await waitFor(() => {
      expect(searchApproved).toHaveBeenCalled();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filters & sort/i }));
    await user.click(screen.getByRole("button", { name: "Knee" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.getByTestId("exercise-request-card")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Exercise")).toHaveValue("");
  });

  it("does not show the request card on My exercises empty state", async () => {
    renderAllExercises(fillPhysioAppRoutePattern("exercises"), emptyAllLibraryClient());

    await waitFor(() => {
      expect(screen.getByText(TRY_ALL_OR_REQUEST)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("exercise-request-card")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: SUBMIT_REQUEST }),
    ).not.toBeInTheDocument();
  });

  it("does not show the request card when My exercises search matches nothing", async () => {
    const library = {
      listMyExercises: vi.fn().mockResolvedValue({
        list_state: "nothing_in_my_exercises_matches",
        search_query: "Missing",
        sections: {
          new_from_requests: [],
          pinned: [],
          recently_used_and_saved: [],
        },
      }),
      searchApproved: vi.fn(),
    } as unknown as ExerciseLibraryClient;

    renderAllExercises(`${fillPhysioAppRoutePattern("exercises")}?q=Missing`, library);

    await waitFor(() => {
      expect(screen.getByText(TRY_ALL_OR_REQUEST)).toBeInTheDocument();
    });
    expect(screen.queryByTestId("exercise-request-card")).not.toBeInTheDocument();
  });

  it("disables Submit request when Exercise is empty", async () => {
    renderAllExercises(
      fillPhysioAppRoutePattern("exerciseSearch"),
      emptyAllLibraryClient(),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: SUBMIT_REQUEST })).toBeDisabled();
    });
  });

  it("submits the edited Exercise value when search prefilled the field", async () => {
    const submitRequest = vi.fn().mockResolvedValue({
      outcome: "created",
      request_id: "req-1",
      status: "drafting",
      exercise_id: "ex-1",
    });
    const requests = {
      ...stubRequests(),
      submitRequest,
    } as unknown as ExerciseRequestsClient;

    renderAllExercises(
      `${fillPhysioAppRoutePattern("exerciseSearch")}?q=UniqueName`,
      emptyAllLibraryClient(),
      requests,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Exercise")).toHaveValue("UniqueName");
    });

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Exercise"));
    await user.type(screen.getByLabelText("Exercise"), "Edited name");
    await user.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));

    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requested_name: "Edited name",
        }),
      );
    });
  });

  it("submits the typed Exercise value when there is no search query", async () => {
    const submitRequest = vi.fn().mockResolvedValue({
      outcome: "created",
      request_id: "req-1",
      status: "drafting",
      exercise_id: "ex-1",
    });
    const requests = {
      ...stubRequests(),
      submitRequest,
    } as unknown as ExerciseRequestsClient;

    renderAllExercises(
      fillPhysioAppRoutePattern("exerciseSearch"),
      emptyAllLibraryClient(),
      requests,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Exercise")).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Exercise"), "Custom move");
    await user.click(screen.getByRole("button", { name: SUBMIT_REQUEST }));

    await waitFor(() => {
      expect(submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          requested_name: "Custom move",
          resolution: "submit",
        }),
      );
    });
  });

  it("does not show the card on All exercises when results exist and there is no search", async () => {
    const library = {
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
            exercise_name: "Heel slide",
            category: "stretching",
            body_regions: ["knee"],
            usage_count: 1,
          },
        ],
        next_cursor: null,
        search_link: null,
        total_count: 1,
      }),
    } as unknown as ExerciseLibraryClient;

    renderAllExercises(fillPhysioAppRoutePattern("exerciseSearch"), library);

    await waitFor(() => {
      expect(screen.getByText("Heel slide")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("exercise-request-card")).not.toBeInTheDocument();
  });

  it("shows the card only after switching to All exercises from My exercises empty", async () => {
    renderAllExercises(fillPhysioAppRoutePattern("exercises"), emptyAllLibraryClient());

    await waitFor(() => {
      expect(screen.queryByTestId("exercise-request-card")).not.toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: LIB_TAB_ALL }));

    await waitFor(() => {
      expect(screen.getByTestId("exercise-request-card")).toBeInTheDocument();
    });
  });
});
