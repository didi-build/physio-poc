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
import {
  PUBLISH_SHEET_TITLE,
  SHARE_PROGRAM_TITLE,
} from "../../src/ui/copy/program-publish.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";

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

const BUILDER_FIXTURE: ProgramBuilderView = {
  program_id: "prog-test",
  code: "PRG-TEST",
  name: "Test program",
  created_at: "2026-10-24T12:00:00.000Z",
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  draft_saved_at: "2026-10-24T12:00:00.000Z",
  exercise_count: 0,
  library_updates_to_review: 0,
  rows: [],
  open_share_link: false,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    getProgramByCode: vi.fn().mockResolvedValue(BUILDER_FIXTURE),
    getShareLink: vi.fn().mockResolvedValue({
      display_state: "draft_only",
      share_link: "",
      share_link_status: "none",
      share_link_state: "none",
      expires_at: null,
      open_share_link: false,
      draft: { version: 1, updated_at: "2026-10-24T12:00:00.000Z" },
      published: null,
      program_code: "PRG-TEST",
      program_name: "Test program",
      link_expires_in: null,
      link_expires_on: null,
      practitioner_default_expires_in: "1_year",
      publish_change_lines: ["0 exercises"],
      published_at: null,
    }),
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

  it("renders the publish sheet route for /programs/:programCode/publish", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST/publish"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          practitionerSessionClient={stubPractitionerSessionClient()}
        />
      </MemoryRouter>,
    );
    const main = document.querySelector(".shell-main");
    expect(main).toBeTruthy();
    expect(
      await within(main as HTMLElement).findByRole("dialog", {
        name: PUBLISH_SHEET_TITLE,
      }),
    ).toBeVisible();
  });

  it("renders the share screen for /programs/:programCode/share", async () => {
    render(
      <MemoryRouter initialEntries={["/programs/PRG-TEST/share"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          practitionerSessionClient={stubPractitionerSessionClient()}
        />
      </MemoryRouter>,
    );
    const main = document.querySelector(".shell-main");
    expect(main).toBeTruthy();
    expect(
      await within(main as HTMLElement).findByRole("heading", {
        level: 1,
        name: SHARE_PROGRAM_TITLE,
      }),
    ).toBeVisible();
  });
});
