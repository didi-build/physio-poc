/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { createElement, isValidElement } from "react";
import { cleanup, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PHYSIO_APP_SPA_ROUTE_NAMES } from "../../src/app-routes.js";
import { createPhysioAppRouteElements, PhysioApp } from "../../src/ui/App.js";
import { PROGRAMS_PAGE_TITLE } from "../../src/ui/copy/programs.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";

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

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProgramsClient;
}

describe("Programs routes (DIDI-1176)", () => {
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

  it("shows the programs list in the shell main for /programs/:programCode/publish (not-found)", () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST/publish"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
        />
      </MemoryRouter>,
    );
    const main = document.querySelector(".shell-main");
    expect(main).toBeTruthy();
    expect(
      within(main as HTMLElement).getByRole("heading", {
        level: 1,
        name: PROGRAMS_PAGE_TITLE,
      }),
    ).toBeVisible();
  });

  it("shows the programs list in the shell main for /programs/:programCode/share (not-found)", () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST/share"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
        />
      </MemoryRouter>,
    );
    const main = document.querySelector(".shell-main");
    expect(main).toBeTruthy();
    expect(
      within(main as HTMLElement).getByRole("heading", {
        level: 1,
        name: PROGRAMS_PAGE_TITLE,
      }),
    ).toBeVisible();
  });
});
