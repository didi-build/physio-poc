/**
 * @vitest-environment jsdom
 *
 * Behavioural retry coverage for DIDI-1082 R4 (replaces grep-only guard).
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { PhysioApp } from "../../src/ui/App.js";
import { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import type { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  TRY_AGAIN,
  TRYING_AGAIN,
  failedSaveItem,
} from "../../src/ui/copy/shared-load-states.js";
import { SharedFailedSaveAlert } from "../../src/ui/shared-load-states/SharedLoadStates.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";

afterEach(() => {
  cleanup();
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
  } as unknown as ExerciseRequestsClient;
}

describe("DIDI-1082 retry behaviour (spec L34/L39)", () => {
  it("keeps failed-save alert mounted with Trying again... during async retry and refocuses alert on failure", async () => {
    let reject!: () => void;
    const onTryAgain = vi.fn(
      () =>
        new Promise<void>((_res, rej) => {
          reject = rej;
        }),
    );
    render(
      <SharedFailedSaveAlert
        message={failedSaveItem("program")}
        onTryAgain={onTryAgain}
        testId="retry-focus-alert"
      />,
    );
    const alert = screen.getByTestId("retry-focus-alert");
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    expect(within(alert).getByText(failedSaveItem("program"))).toBeInTheDocument();
    reject();
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  });

  it("program share load Try again keeps banner mounted during retry", async () => {
    let call = 0;
    const getProgramByCode = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.reject(new Error("network"));
      }
      return Promise.resolve({ program_id: "p1", code: "PRG-1", name: "P" });
    });
    const getShareLink = vi.fn().mockResolvedValue({
      program_id: "p1",
      program_code: "PRG-1",
      program_name: "P",
      share_link: null,
      link_expires_in: null,
      link_expires_on: null,
      expires_at: null,
    });
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("programShare", { programCode: "PRG-1" }),
        ]}
      >
        <NavigationTestProviders>
          <PhysioApp
            exerciseLibraryClient={mockClient({})}
            exerciseRequestsClient={stubRequestsClient()}
            programsClient={
              { getProgramByCode, getShareLink } as unknown as ProgramsClient
            }
          />
        </NavigationTestProviders>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: TRY_AGAIN })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    await waitFor(() => {
      expect(getProgramByCode).toHaveBeenCalledTimes(2);
    });
  });
});
