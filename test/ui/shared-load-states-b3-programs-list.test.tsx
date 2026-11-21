/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  listLoadErrorPrimary,
  listTokenForSurface,
  loadingListVisible,
  TRY_AGAIN,
  TRYING_AGAIN,
} from "../../src/ui/copy/shared-load-states.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
});

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: {
        new_from_requests: [],
        pinned: [],
        recently_used_and_saved: [],
      },
    }),
    searchApproved: vi.fn(),
  } as unknown as ExerciseLibraryClient;
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

describe("DIDI-1082 B3 programs list retry (integration)", () => {
  it("B3 void mutant killer: programs list Try again shows Trying again while refresh promise is in flight", async () => {
    let rejectHang!: (error: Error) => void;
    const hang = new Promise<{ items: []; matched_code: null }>((_, reject) => {
      rejectHang = reject;
    });
    const listPrograms = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementation(() => hang);

    render(
      <MemoryRouter initialEntries={["/programs"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
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
    const tryAgain = screen.getByRole("button", { name: TRY_AGAIN });
    await userEvent.click(tryAgain);

    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    expect(
      screen.queryByText(loadingListVisible(listTokenForSurface("programs"))),
    ).not.toBeInTheDocument();

    rejectHang(new Error("network"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeEnabled();
    });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: TRY_AGAIN }),
    );
    expect(listPrograms).toHaveBeenCalledTimes(2);
  });
});
