/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
import { PositionThumbnail } from "../../src/ui/exercise-positions/PositionThumbnail.js";
import { PublicLinkExerciseRow } from "../../src/ui/link-page/PublicLinkExerciseRow.js";
import {
  desktopMediaScope,
  printMediaScope,
  readPrintStylesheet,
  ruleDeclarationsInScope,
} from "./public-link-print-css-scope.js";
import { STARTING_POSITION } from "../../src/ui/copy/exercise-requests.js";
import {
  ADD_ENDING_POSITION,
  EDIT_ENDING_POSITION,
  ENDING_POSITION_EMPTY,
  ENDING_POSITION_LABEL,
  POSITIONS_HEADING,
  POSITIONS_HELPER,
} from "../../src/ui/copy/ending-position.js";
import { CANCEL, SAVE, editFieldLabel } from "../../src/ui/copy/exercise-requests.js";
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
    expect(screen.getByText(DESC_TEXT)).toBeTruthy();
    expect(screen.getByText(START_TEXT)).toBeTruthy();
    expect(screen.getByText(END_TEXT)).toBeTruthy();
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

  it("omits starting pair when only ending position is set", () => {
    const container = renderRow({
      description: DESC_TEXT,
      startingPosition: "",
      endingPosition: END_TEXT,
    });
    const dl = container.querySelector(".link-page-positions");
    expect(dl).not.toBeNull();
    const region = within(dl as HTMLElement);
    expect(region.queryByText(STARTING_POSITION)).toBeNull();
    expect(region.getByText(END_TEXT)).toBeTruthy();
    document.body.removeChild(container);
  });

  it("follows reading order title, description, carousel, positions, dose, note", () => {
    const container = renderRow({
      description: DESC_TEXT,
      startingPosition: START_TEXT,
      endingPosition: END_TEXT,
      note: "Patient note line.",
      media: {
        start_url: "https://cdn.example/start.png",
        end_url: "https://cdn.example/end.png",
      },
    });
    const row = container.querySelector(".link-page-row");
    expect(row).not.toBeNull();
    const tags = Array.from(row!.children).map((el) => el.tagName.toLowerCase());
    const classHints = Array.from(row!.children).map((el) => el.className);
    const titleIdx = classHints.findIndex((c) => c.includes("link-page-row-title"));
    const descIdx = classHints.findIndex((c) =>
      c.includes("link-page-row-description"),
    );
    const carouselIdx = classHints.findIndex((c) => c.includes("link-page-carousel"));
    const positionsIdx = classHints.findIndex((c) => c.includes("link-page-positions"));
    const doseIdx = classHints.findIndex(
      (c) => typeof c === "string" && c.includes("link-page-dose"),
    );
    const noteIdx = classHints.findIndex((c) => c.includes("link-page-row-note"));
    expect(titleIdx).toBeGreaterThanOrEqual(0);
    expect(descIdx).toBeGreaterThan(titleIdx);
    expect(carouselIdx).toBeGreaterThan(descIdx);
    expect(positionsIdx).toBeGreaterThan(carouselIdx);
    expect(doseIdx).toBeGreaterThan(positionsIdx);
    expect(noteIdx).toBeGreaterThan(doseIdx);
    expect(tags[titleIdx]).toBe("h2");
    document.body.removeChild(container);
  });

  it("hides visual markers from assistive tech inside definition list pairs", () => {
    const container = renderRow({
      description: DESC_TEXT,
      startingPosition: START_TEXT,
      endingPosition: END_TEXT,
    });
    const markers = container.querySelectorAll(".link-page-positions-marker");
    expect(markers.length).toBe(2);
    for (const marker of markers) {
      expect(marker.getAttribute("aria-hidden")).toBe("true");
    }
    expect(container.querySelector("dl.link-page-positions")).not.toBeNull();
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

  it("returns focus to the Edit link after Save on starting position", async () => {
    const container = document.createElement("div");
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
    const editStarting = within(card).getByRole("button", {
      name: editFieldLabel(STARTING_POSITION),
    });
    const focusAfterSave = vi.spyOn(editStarting, "focus");
    await userEvent.click(editStarting);
    const textarea = within(card).getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated start.");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));
    await waitFor(() => {
      expect(within(card).queryByRole("button", { name: SAVE })).toBeNull();
    });
    await waitFor(() => {
      expect(focusAfterSave).toHaveBeenCalled();
    });
    document.body.removeChild(container);
  });

  it("returns focus to the Edit link after Cancel on ending position", async () => {
    const container = document.createElement("div");
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
    const editEnding = within(card).getByRole("button", { name: EDIT_ENDING_POSITION });
    const focusAfterCancel = vi.spyOn(editEnding, "focus");
    await userEvent.click(editEnding);
    await userEvent.click(within(card).getByRole("button", { name: CANCEL }));
    await waitFor(() => {
      expect(focusAfterCancel).toHaveBeenCalled();
    });
    document.body.removeChild(container);
  });

  it("links E4 helper to both position textareas with aria-describedby", async () => {
    const container = document.createElement("div");
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
    const helper = screen.getByText(POSITIONS_HELPER);
    const helperId = helper.getAttribute("id");
    expect(helperId).toBeTruthy();
    const card = screen.getByTestId("exercise-positions-card");
    await userEvent.click(
      within(card).getByRole("button", { name: editFieldLabel(STARTING_POSITION) }),
    );
    expect(within(card).getByRole("textbox").getAttribute("aria-describedby")).toBe(
      helperId,
    );
    await userEvent.click(within(card).getByRole("button", { name: CANCEL }));
    await userEvent.click(
      within(card).getByRole("button", { name: EDIT_ENDING_POSITION }),
    );
    expect(within(card).getByRole("textbox").getAttribute("aria-describedby")).toBe(
      helperId,
    );
    document.body.removeChild(container);
  });

  it("shows generating read-only empty ending as E6 only (no E7, no Edit)", () => {
    render(
      <ExercisePositionsCard
        startingPosition={START_TEXT}
        endingPosition=""
        showThumbnails={false}
        editable={false}
        showHelper={false}
      />,
    );
    expect(screen.getByText(ENDING_POSITION_EMPTY)).toBeTruthy();
    expect(screen.queryByRole("button", { name: ADD_ENDING_POSITION })).toBeNull();
    expect(screen.queryByRole("button", { name: EDIT_ENDING_POSITION })).toBeNull();
  });

  it("omits a still after image load error and uses full-width step layout", () => {
    const onPresence = vi.fn();
    render(
      <div className="ex-positions-step ex-positions-step--start">
        <PositionThumbnail
          src="https://example.invalid/does-not-exist.png"
          show
          onPresenceChange={onPresence}
        />
      </div>,
    );
    const img = document.querySelector(".ex-positions-thumb");
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(document.querySelector(".ex-positions-thumb")).toBeNull();
    expect(onPresence).toHaveBeenLastCalledWith(false);
  });

  it("keeps the editor open with draft text when save rejects", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const onSaveStarting = vi.fn().mockRejectedValue(new Error("invalid_input"));
    render(
      <ExercisePositionsCard
        startingPosition={START_TEXT}
        endingPosition={END_TEXT}
        showThumbnails={false}
        editable
        showHelper
        onSaveStarting={onSaveStarting}
        onSaveEnding={async () => {}}
      />,
      { container },
    );
    const card = screen.getByTestId("exercise-positions-card");
    await userEvent.click(
      within(card).getByRole("button", {
        name: editFieldLabel(STARTING_POSITION),
      }),
    );
    const textarea = within(card).getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Still typing after fail.");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));
    await waitFor(() => {
      expect(onSaveStarting).toHaveBeenCalledWith("Still typing after fail.");
    });
    expect(within(card).getByRole("button", { name: SAVE })).toBeTruthy();
    expect((within(card).getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Still typing after fail.",
    );
    document.body.removeChild(container);
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

describe("DIDI-1283 link and print layout CSS", () => {
  it("places description and positions in the desktop text column at 1024px", () => {
    const css = readPrintStylesheet();
    const desktop = desktopMediaScope(css);
    const rowRule = ruleDeclarationsInScope(desktop, ".link-page-row");
    expect(rowRule).toMatch(/grid-template-areas:[\s\S]*description[\s\S]*positions/);
    expect(
      ruleDeclarationsInScope(desktop, ".link-page-row-description--grid"),
    ).toMatch(/grid-area:\s*description/);
    expect(ruleDeclarationsInScope(desktop, ".link-page-positions--grid")).toMatch(
      /grid-area:\s*positions/,
    );
  });

  it("keeps description and positions in print column 1 at 12px", () => {
    const css = readPrintStylesheet();
    const print = printMediaScope(css);
    expect(ruleDeclarationsInScope(print, ".link-page-row-description")).toMatch(
      /font-size:\s*12px/,
    );
    expect(ruleDeclarationsInScope(print, ".link-page-positions")).toMatch(
      /font-size:\s*12px/,
    );
    expect(print).toMatch(
      /\.link-page-row-title,\s*\n\s*\.link-page-row-description,\s*\n\s*\.link-page-positions[\s\S]*?grid-column:\s*1/,
    );
  });

  it("uses a 2px teal-200 marker line between patient position pairs", () => {
    const css = readPrintStylesheet();
    const pairRule = css.match(
      /\.link-page-positions-pair:not\(:last-child\)::after\s*\{[^}]+\}/s,
    );
    expect(pairRule?.[0]).toMatch(/width:\s*2px/);
    expect(pairRule?.[0]).toContain("#99f6e4");
  });

  it("widens position step text when no thumbnail is present", () => {
    const css = readFileSync(
      join(process.cwd(), "src/ui/styles/exercise-library.css"),
      "utf8",
    );
    expect(css).toMatch(
      /\.ex-positions-step--no-thumb\s*\{[^}]*grid-template-columns:\s*auto\s+1fr/,
    );
    const markerRule = css.match(/\.ex-positions-step--start::after\s*\{[^}]+\}/s);
    expect(markerRule?.[0]).toMatch(/width:\s*2px/);
    expect(markerRule?.[0]).toContain("#99f6e4");
  });
});
