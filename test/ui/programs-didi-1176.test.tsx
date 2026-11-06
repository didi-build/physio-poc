/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { createElement, isValidElement } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PHYSIO_APP_SPA_ROUTE_NAMES, fillPhysioAppRoutePattern } from "../../src/app-routes.js";
import { createPhysioAppRouteElements, PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  CLOSE_SHARE_LINK_SHEET_TITLE,
  PUBLISH_SHEET_TITLE,
  SHARE_PROGRAM_TITLE,
} from "../../src/ui/copy/programs.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
  vi.restoreAllMocks();
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
    searchApproved: vi.fn().mockResolvedValue({
      exercises: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
    }),
  } as unknown as ExerciseLibraryClient;
}

function stubRequestsClient(): ExerciseRequestsClient {
  return {
    getInProgressCount: vi.fn().mockResolvedValue({ in_progress_count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

function builderView(overrides: Partial<ProgramBuilderView> = {}): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program A",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 2,
    library_updates_to_review: 0,
    rows: [],
    open_share_link: false,
    share_link_status: "none",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
    ...overrides,
  };
}

function stubProgramsClient(view: ProgramBuilderView): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    getProgramByCode: vi.fn().mockResolvedValue(view),
  } as unknown as ProgramsClient;
}

describe("Programs publish and share routes (DIDI-1176)", () => {
  it("maps every SPA route name to a non-null route element", () => {
    const elements = createPhysioAppRouteElements(
      createElement("div"),
      createElement("div"),
    );
    for (const routeName of PHYSIO_APP_SPA_ROUTE_NAMES) {
      const element = elements[routeName] ?? null;
      expect(element, routeName).not.toBeNull();
      expect(isValidElement(element), routeName).toBe(true);
    }
  });

  it("renders the approved publish sheet title on /programs/:programCode/publish", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("programPublish", { programCode: "PRG-TEST" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient(builderView())}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("program-publish-page")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { level: 1, name: PUBLISH_SHEET_TITLE }),
    ).toBeInTheDocument();
    const main = document.querySelector(".shell-main");
    expect(main).toBeTruthy();
    expect(
      within(main as HTMLElement).getByTestId("program-publish-page"),
    ).toBeVisible();
  });

  it("renders the approved share screen title on /programs/:programCode/share", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          fillPhysioAppRoutePattern("programShare", { programCode: "PRG-TEST" }),
        ]}
      >
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient(
            builderView({ share_link_status: "open", open_share_link: true }),
          )}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("program-share-page")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { level: 1, name: SHARE_PROGRAM_TITLE }),
    ).toBeInTheDocument();
    expect(screen.queryByText(CLOSE_SHARE_LINK_SHEET_TITLE)).not.toBeInTheDocument();
  });
});
