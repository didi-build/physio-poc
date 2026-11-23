/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MyCopyEditorPage } from "../../src/ui/exercise-library/MyCopyEditorPage.js";
import {
  fillPhysioAppRoutePattern,
  physioAppSpaRoutePath,
} from "../../src/app-routes.js";
import { type ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import { ExerciseLibraryApiProvider } from "../../src/ui/api/exercise-library-context.js";
import { NavigationTestProviders } from "./navigation-test-providers.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import type { ComponentProps } from "react";
import { ExercisePositionsCard } from "../../src/ui/exercise-positions/ExercisePositionsCard.js";
import { PublicLinkExerciseRow } from "../../src/ui/link-page/PublicLinkExerciseRow.js";
import { STARTING_POSITION } from "../../src/ui/copy/exercise-requests.js";
import {
  ADD_ENDING_POSITION,
  EDIT_ENDING_POSITION,
  ENDING_POSITION_EMPTY,
  ENDING_POSITION_LABEL,
  POSITIONS_HEADING,
  POSITIONS_HELPER,
} from "../../src/ui/copy/ending-position.js";
import { SAVE, editFieldLabel } from "../../src/ui/copy/exercise-requests.js";
import { userEvent } from "@testing-library/user-event";
import "../../src/ui/styles/exercise-library.css";
import "../../src/ui/styles/public-link-page.css";

const START_TEXT = "Lying on your back with legs extended.";
const END_TEXT = "Knee bent, heel near the hip.";
const DESC_TEXT = "A gentle knee flexion stretch.";
const LAST_STEP_FALLBACK = "Slide heel toward the buttock.";

afterEach(() => {
  cleanup();
});

describe.each([390, 1280])("DIDI-1283 Positions card at %i px", (widthPx) => {
  it("exposes accessible names and helper in editable mode", () => {
    const container = document.createElement("div");
    container.style.width = `${widthPx}px`;
    document.body.appendChild(container);
    render(
      <ExercisePositionsCard
        startingPosition={START_TEXT}
        endingPosition={END_TEXT}
        showThumbnails={false}
        editable
        showHelper
        onSaveStarting={async () => {}}
        onSaveEnding={async () => {}}
      />,
      { container },
    );
    const card = screen.getByTestId("exercise-positions-card");
    expect(card.getAttribute("aria-labelledby")).toBeTruthy();
    const heading = screen.getByRole("heading", { name: POSITIONS_HEADING });
    expect(heading.id).toBe(card.getAttribute("aria-labelledby"));
    expect(screen.getByText(POSITIONS_HELPER)).toHaveAttribute("id");
    expect(screen.getByRole("button", { name: EDIT_ENDING_POSITION })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: editFieldLabel(STARTING_POSITION),
      }),
    ).toBeTruthy();
    document.body.removeChild(container);
  });

  it("shows legacy empty ending text without add action when read-only", () => {
    const container = document.createElement("div");
    container.style.width = `${widthPx}px`;
    document.body.appendChild(container);
    render(
      <ExercisePositionsCard
        startingPosition={START_TEXT}
        endingPosition=""
        showThumbnails={false}
        editable={false}
        showHelper={false}
      />,
      { container },
    );
    expect(screen.getByText(ENDING_POSITION_EMPTY)).toBeTruthy();
    expect(screen.queryByRole("button", { name: ADD_ENDING_POSITION })).toBeNull();
    expect(screen.queryByText(LAST_STEP_FALLBACK)).toBeNull();
    document.body.removeChild(container);
  });
});

describe.each([390, 1280])("DIDI-1283 patient link row at %i px", (widthPx) => {
  const baseRow = {
    title: "Heel slide",
    prescriptionType: "stretching" as const,
    params: { hold_s: 30 },
    note: null,
    media: null,
  };

  function renderRow(props: Partial<ComponentProps<typeof PublicLinkExerciseRow>>) {
    const container = document.createElement("div");
    container.style.width = `${widthPx}px`;
    document.body.appendChild(container);
    render(
      <PublicLinkExerciseRow
        {...baseRow}
        description={undefined}
        startingPosition={undefined}
        endingPosition={undefined}
        {...props}
      />,
      { container },
    );
    return container;
  }

  it("renders exact pinned position and description text when both positions are set", () => {
    const container = renderRow({
      description: DESC_TEXT,
      startingPosition: START_TEXT,
      endingPosition: END_TEXT,
    });
    expect(screen.getByText(DESC_TEXT)).toBeTruthy();
    const dl = container.querySelector(".link-page-positions");
    expect(dl).not.toBeNull();
    const region = within(dl as HTMLElement);
    expect(region.getByText(STARTING_POSITION)).toBeTruthy();
    expect(region.getByText(START_TEXT)).toBeTruthy();
    expect(region.getByText(ENDING_POSITION_LABEL)).toBeTruthy();
    expect(region.getByText(END_TEXT)).toBeTruthy();
    expect(screen.queryByText(ENDING_POSITION_EMPTY)).toBeNull();
    expect(screen.queryByText(LAST_STEP_FALLBACK)).toBeNull();
    document.body.removeChild(container);
  });

  it("omits empty ending position without fallback when only starting is set", () => {
    const container = renderRow({
      description: DESC_TEXT,
      startingPosition: START_TEXT,
      endingPosition: "",
    });
    const dl = container.querySelector(".link-page-positions");
    expect(dl).not.toBeNull();
    const region = within(dl as HTMLElement);
    expect(region.getByText(START_TEXT)).toBeTruthy();
    expect(region.queryByText(ENDING_POSITION_LABEL)).toBeNull();
    expect(screen.queryByText(ENDING_POSITION_EMPTY)).toBeNull();
    expect(screen.queryByText(LAST_STEP_FALLBACK)).toBeNull();
    document.body.removeChild(container);
  });

  it("keeps position text on the row used for screen and print layouts", () => {
    const container = renderRow({
      description: DESC_TEXT,
      startingPosition: START_TEXT,
      endingPosition: END_TEXT,
      media: {
        start_url: "https://cdn.example/start.png",
        end_url: "https://cdn.example/end.png",
      },
    });
    expect(screen.getByTestId("public-link-exercise-print")).toBeTruthy();
    expect(container.querySelector(".link-page-positions")).not.toBeNull();
    expect(container.querySelector(".link-page-only-print")).not.toBeNull();
    document.body.removeChild(container);
  });

  it("renders nothing for positions or description when all are empty", () => {
    const container = renderRow({
      description: "",
      startingPosition: "",
      endingPosition: "   ",
    });
    expect(screen.queryByText(DESC_TEXT)).toBeNull();
    expect(container.querySelector(".link-page-positions")).toBeNull();
    expect(screen.queryByText(LAST_STEP_FALLBACK)).toBeNull();
    document.body.removeChild(container);
  });
});

describe("DIDI-1283 Edit my copy", () => {
  it("edits starting and ending positions in the Positions card", async () => {
    const client = {
      getExerciseDetails: vi.fn().mockResolvedValue({
        exercise_id: "ex-1",
        library: {
          title: "Heel slide",
          starting_position: "Supine.",
          ending_position: "Knee extended.",
        },
        resolved_text: [
          {
            key: "starting_position",
            resolved: START_TEXT,
            library_value: "Supine.",
            library_updated: false,
          },
          {
            key: "ending_position",
            resolved: "Heel near hip.",
            library_value: "Knee extended.",
            library_updated: false,
          },
        ],
      }),
      updateMyCopy: vi.fn().mockResolvedValue({}),
      removeFromMyExercises: vi.fn(),
      applyUndo: vi.fn(),
    } as unknown as ExerciseLibraryClient;
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("exerciseMyCopy", { exerciseId: "ex-1" }),
        ]}
      >
        <NavigationTestProviders>
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
        </NavigationTestProviders>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: POSITIONS_HEADING })).toBeTruthy();
      expect(screen.getByText(POSITIONS_HELPER)).toBeTruthy();
    });
    const card = screen.getByTestId("exercise-positions-card");
    await userEvent.click(
      within(card).getByRole("button", {
        name: editFieldLabel(STARTING_POSITION),
      }),
    );
    const textarea = within(card).getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "On your side.");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));
    expect(client.updateMyCopy).toHaveBeenCalledWith("ex-1", {
      text_overrides: { starting_position: "On your side." },
    });
    await waitFor(() => {
      expect(within(card).queryByRole("button", { name: SAVE })).toBeNull();
    });
    expect(client.updateMyCopy).toHaveBeenCalledTimes(1);
  });

  it("shows library-details legacy empty ending without add action", () => {
    render(
      <ExercisePositionsCard
        startingPosition={START_TEXT}
        endingPosition=""
        showThumbnails={false}
        allowAddEndingWhenEmpty={false}
        editable={false}
        showHelper={false}
      />,
    );
    expect(screen.getByText(ENDING_POSITION_EMPTY)).toBeTruthy();
    expect(screen.queryByRole("button", { name: ADD_ENDING_POSITION })).toBeNull();
    expect(screen.queryByRole("button", { name: EDIT_ENDING_POSITION })).toBeNull();
  });
});
