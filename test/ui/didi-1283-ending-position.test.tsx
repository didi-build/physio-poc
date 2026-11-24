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
import * as PositionThumbnailModule from "../../src/ui/exercise-positions/PositionThumbnail.js";
import { PublicLinkExerciseRow } from "../../src/ui/link-page/PublicLinkExerciseRow.js";
import {
  desktopMediaScope,
  printMediaScope,
  readPrintStylesheet,
  ruleDeclarationsInScope,
} from "./public-link-print-css-scope.js";
import { CANCEL, SAVE } from "../../src/ui/copy/exercise-requests.js";
import {
  LIBRARY_CHANGED,
  LIBRARY_NOW,
  TEXT_SECTION,
} from "../../src/ui/copy/exercise-library.js";

/** Pinned E1–E7 and reset accessible name (not imported constants). */
const PIN_E1 = "Positions";
const PIN_E2 = "Edit Ending position";
const PIN_E3 = "For example: knee bent, heel slid in toward the buttock";
const PIN_E4 =
  "Describe only the body parts that move in this exercise. Everything else stays as in the starting position.";
const PIN_E5 = "Edit Starting position";
const PIN_E6 = "Not added yet.";
const PIN_E7 = "Add ending position";
const PIN_ENDING_LABEL = "Ending position";
const PIN_STARTING_LABEL = "Starting position";
const PIN_RESET_START_ARIA = "Reset Starting position to the library version";
const PIN_RESET_END_ARIA = "Reset Ending position to the library version";
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
    const heading = screen.getByRole("heading", { name: PIN_E1 });
    expect(heading.id).toBe(card.getAttribute("aria-labelledby"));
    expect(screen.getByText(PIN_E4)).toHaveAttribute("id");
    expect(screen.getByRole("button", { name: PIN_E2 })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: PIN_E5,
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
    expect(screen.getByText(PIN_E6)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PIN_E7 })).toBeNull();
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

  it("omits description paragraph when saved description is empty", () => {
    const container = renderRow({
      description: "",
      startingPosition: START_TEXT,
      endingPosition: END_TEXT,
    });
    expect(container.querySelector(".link-page-row-description")).toBeNull();
    expect(screen.queryByText(DESC_TEXT)).toBeNull();
    document.body.removeChild(container);
  });

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
    expect(region.getByText(PIN_STARTING_LABEL)).toBeTruthy();
    expect(region.getByText(START_TEXT)).toBeTruthy();
    expect(region.getByText(PIN_ENDING_LABEL)).toBeTruthy();
    expect(region.getByText(END_TEXT)).toBeTruthy();
    expect(screen.queryByText(PIN_E6)).toBeNull();
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
    expect(region.queryByText(PIN_ENDING_LABEL)).toBeNull();
    expect(screen.queryByText(PIN_E6)).toBeNull();
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
    expect(region.queryByText(PIN_STARTING_LABEL)).toBeNull();
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
      expect(screen.getByRole("heading", { name: PIN_E1 })).toBeTruthy();
      expect(screen.getByText(PIN_E4)).toBeTruthy();
    });
    const card = screen.getByTestId("exercise-positions-card");
    await userEvent.click(
      within(card).getByRole("button", {
        name: PIN_E5,
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

  it("returns focus to the new Edit link after Save on starting position", async () => {
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
    await userEvent.click(within(card).getByRole("button", { name: PIN_E5 }));
    const textarea = within(card).getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated start.");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));
    await waitFor(() => {
      expect(within(card).queryByRole("button", { name: SAVE })).toBeNull();
    });
    await waitFor(() => {
      const editStarting = within(card).getByRole("button", { name: PIN_E5 });
      expect(document.activeElement).toBe(editStarting);
    });
    document.body.removeChild(container);
  });

  it("returns focus to the new Edit link after Cancel on ending position", async () => {
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
    await userEvent.click(within(card).getByRole("button", { name: PIN_E2 }));
    await userEvent.click(within(card).getByRole("button", { name: CANCEL }));
    await waitFor(() => {
      const editEnding = within(card).getByRole("button", { name: PIN_E2 });
      expect(document.activeElement).toBe(editEnding);
    });
    document.body.removeChild(container);
  });

  it("pins E3 placeholder on ending position edit", async () => {
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
    await userEvent.click(within(card).getByRole("button", { name: PIN_E2 }));
    expect((within(card).getByRole("textbox") as HTMLTextAreaElement).placeholder).toBe(
      PIN_E3,
    );
    document.body.removeChild(container);
  });

  it("pins reset accessible name on edited starting position", () => {
    render(
      <ExercisePositionsCard
        startingPosition={START_TEXT}
        endingPosition={END_TEXT}
        showThumbnails={false}
        editable
        showHelper
        startingCopyMeta={{
          edited: true,
          libraryUpdated: false,
          libraryValue: "Library start.",
          onReset: () => {},
          onUseLibrary: () => {},
          onKeepMine: () => {},
        }}
        onSaveStarting={async () => {}}
        onSaveEnding={async () => {}}
      />,
    );
    const card = screen.getByTestId("exercise-positions-card");
    expect(
      within(card).getByRole("button", { name: PIN_RESET_START_ARIA }),
    ).toBeTruthy();
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
    const helper = screen.getByText(PIN_E4);
    const helperId = helper.getAttribute("id");
    expect(helperId).toBeTruthy();
    const card = screen.getByTestId("exercise-positions-card");
    await userEvent.click(within(card).getByRole("button", { name: PIN_E5 }));
    expect(within(card).getByRole("textbox").getAttribute("aria-describedby")).toBe(
      helperId,
    );
    await userEvent.click(within(card).getByRole("button", { name: CANCEL }));
    await userEvent.click(within(card).getByRole("button", { name: PIN_E2 }));
    expect(within(card).getByRole("textbox").getAttribute("aria-describedby")).toBe(
      helperId,
    );
    document.body.removeChild(container);
  });

  it("shows Add ending position control when ending is empty and editable", () => {
    render(
      <ExercisePositionsCard
        startingPosition={START_TEXT}
        endingPosition=""
        showThumbnails={false}
        editable
        showHelper={false}
        onSaveStarting={async () => {}}
        onSaveEnding={async () => {}}
      />,
    );
    expect(screen.getByRole("button", { name: PIN_E7 })).toBeTruthy();
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
    expect(screen.getByText(PIN_E6)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PIN_E7 })).toBeNull();
    expect(screen.queryByRole("button", { name: PIN_E2 })).toBeNull();
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
        name: PIN_E5,
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
        editable={false}
        showHelper={false}
      />,
    );
    expect(screen.getByText(PIN_E6)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PIN_E7 })).toBeNull();
    expect(screen.queryByRole("button", { name: PIN_E2 })).toBeNull();
  });

  it("keeps thumbnail column on first render when showThumbnails and src are set", () => {
    const thumbSpy = vi
      .spyOn(PositionThumbnailModule, "PositionThumbnail")
      .mockImplementation(({ src, show }) =>
        show && src ? <img src={src} alt="" className="ex-positions-thumb" /> : null,
      );
    try {
      render(
        <ExercisePositionsCard
          startingPosition={START_TEXT}
          endingPosition={END_TEXT}
          startStillSrc="https://cdn.example/start.png"
          endStillSrc="https://cdn.example/end.png"
          showThumbnails
          editable={false}
          showHelper={false}
        />,
      );
      const startStep = document.querySelector(".ex-positions-step--start");
      const endStep = document.querySelector(".ex-positions-step--end");
      expect(startStep?.className.includes("ex-positions-step--no-thumb")).toBe(false);
      expect(endStep?.className.includes("ex-positions-step--no-thumb")).toBe(false);
    } finally {
      thumbSpy.mockRestore();
    }
  });

  it("G2 My copy keeps positions out of the Text section and supports reset and conflict flows", async () => {
    const client = {
      getExerciseDetails: vi.fn().mockResolvedValue({
        exercise_id: "ex-g2",
        library: {
          title: "Heel slide",
          starting_position: "Library start.",
          ending_position: "Library end.",
        },
        resolved_text: [
          {
            key: "description",
            resolved: "Patient description only.",
            library_value: "Library description.",
            library_updated: false,
          },
          {
            key: "starting_position",
            resolved: START_TEXT,
            library_value: "Library start.",
            library_updated: true,
          },
          {
            key: "ending_position",
            resolved: "My edited ending.",
            library_value: "Library end.",
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
          fillPhysioAppRoutePattern("exerciseMyCopy", { exerciseId: "ex-g2" }),
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
      expect(screen.getByRole("heading", { name: PIN_E1 })).toBeTruthy();
    });
    const textPanel = screen.getByRole("heading", {
      name: TEXT_SECTION,
    }).parentElement!;
    expect(within(textPanel as HTMLElement).queryByText(START_TEXT)).toBeNull();
    expect(within(textPanel as HTMLElement).queryByText(END_TEXT)).toBeNull();
    expect(
      within(textPanel as HTMLElement).getByText("Patient description only."),
    ).toBeTruthy();

    const card = screen.getByTestId("exercise-positions-card");
    expect(within(card).getByText(LIBRARY_CHANGED)).toBeTruthy();
    expect(within(card).getByText(`${LIBRARY_NOW} Library start.`)).toBeTruthy();
    await userEvent.click(
      within(card).getByRole("button", {
        name: PIN_RESET_END_ARIA,
      }),
    );
    expect(client.updateMyCopy).toHaveBeenCalledWith("ex-g2", {
      use_library_version: ["ending_position"],
    });

    await userEvent.click(within(card).getByRole("button", { name: PIN_E2 }));
    const textarea = within(card).getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Edited ending save.");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));
    expect(client.updateMyCopy).toHaveBeenCalledWith("ex-g2", {
      text_overrides: { ending_position: "Edited ending save." },
    });
    expect(client.updateMyCopy).not.toHaveBeenCalledWith("ex-g2", {
      text_overrides: { starting_position: "Edited ending save." },
    });
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
