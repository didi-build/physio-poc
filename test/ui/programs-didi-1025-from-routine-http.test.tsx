/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import { RoutinesClient } from "../../src/ui/api/routines-client.js";
import {
  FILTER_FROM_ROUTINE,
  FILTER_FROM_SCRATCH,
  NEW_PROGRAM_FROM_ROUTINE,
  VIEW_ROUTINE,
  builderOriginBannerTitle,
} from "../../src/ui/copy/programs.js";
import {
  PUBLISHED_NEW_LINK_TOAST,
  PUBLISH_FIRST_PUBLISH_HEADING,
  PUBLISH_NOT_YET,
  PUBLISH_NOW,
  PUBLISH_SHEET_TITLE,
} from "../../src/ui/copy/program-publish.js";
import {
  CREATE_PROGRAM_FROM_ROUTINE,
  USE_FOR_PATIENT,
} from "../../src/ui/copy/routines.js";
import { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { openMigratedDatabase } from "../helpers/exercise-sqlite-fixture.js";
import {
  publishRoutine,
  seedTwoPractitioners,
} from "../helpers/from-routine-http-fixture.js";
import { id } from "../helpers/opaque-test-ids.js";
import {
  appDepsForRoutinesHttpUi,
  createRoutinesHttpFetch,
} from "../helpers/routines-http-ui-fixture.js";
import { wrapProgramsClientWithCacheInvalidation } from "../../src/ui/api/caching-programs-client.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function stubLibraryClient(): ExerciseLibraryClient {
  return {
    listMyExercises: vi.fn().mockResolvedValue({
      list_state: "ok",
      sections: { new_from_requests: [], pinned: [], recently_used_and_saved: [] },
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
    listInProgress: vi.fn().mockResolvedValue({ items: [] }),
    getInProgressCount: vi.fn().mockResolvedValue({ count: 0 }),
  } as unknown as ExerciseRequestsClient;
}

async function httpClients() {
  const storage = await openMigratedDatabase();
  const { practitionerA } = await seedTwoPractitioners(storage);
  await publishRoutine(storage, practitionerA, {
    routine: "ui-1025-routine",
    draftVersion: "ui-1025-draft",
    row: "ui-1025-row",
    name: "Knee routine for UI",
    hold_s: 25,
  });
  const routineId = id("ui-1025-routine");
  const { deps, cookie } = appDepsForRoutinesHttpUi(
    storage,
    practitionerA,
    "a@example.com",
  );
  const fetchFn = createRoutinesHttpFetch(deps, cookie);
  const routinesClient = new RoutinesClient({ fetchFn });
  const programsClient = wrapProgramsClientWithCacheInvalidation(
    new ProgramsClient({ fetchFn }),
  );
  return {
    storage,
    routineId,
    routinesClient,
    programsClient,
    close: () => storage.close(),
  };
}

describe("Program from routine UI (DIDI-1025, integration HTTP)", () => {
  it("shows the From a routine option in the new program chooser", async () => {
    const { programsClient, routinesClient, close } = await httpClients();
    try {
      render(
        <MemoryRouter initialEntries={["/programs/new"]}>
          <PhysioApp
            exerciseLibraryClient={stubLibraryClient()}
            exerciseRequestsClient={stubRequestsClient()}
            programsClient={programsClient}
            routinesClient={routinesClient}
          />
        </MemoryRouter>,
      );
      expect(await screen.findByText(NEW_PROGRAM_FROM_ROUTINE)).toBeInTheDocument();
    } finally {
      close();
    }
  });

  it("creates from routine via Use for a patient and opens the publish sheet without publishing", async () => {
    const { routineId, routinesClient, programsClient, close } = await httpClients();
    try {
      render(
        <MemoryRouter initialEntries={[`/routines/${routineId}`]}>
          <PhysioApp
            exerciseLibraryClient={stubLibraryClient()}
            exerciseRequestsClient={stubRequestsClient()}
            programsClient={programsClient}
            routinesClient={routinesClient}
          />
        </MemoryRouter>,
      );
      const useButtons = await screen.findAllByRole("button", {
        name: USE_FOR_PATIENT,
      });
      await userEvent.click(useButtons[0]!);
      expect(
        await screen.findByRole("dialog", { name: PUBLISH_SHEET_TITLE }),
      ).toBeInTheDocument();
      const publishNow = screen.getByRole("button", { name: PUBLISH_NOW });
      expect(publishNow).not.toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: PUBLISH_NOT_YET }));
      await waitFor(() => {
        expect(
          screen.getByText(
            /Kept as a draft\. Find it in Programs by name or code PRG-/,
          ),
        ).toBeInTheDocument();
      });
    } finally {
      close();
    }
  });

  it("Use for a patient prefills the routine name and Publish now uses the publish API", async () => {
    const { routineId, routinesClient, programsClient, close } = await httpClients();
    try {
      render(
        <MemoryRouter initialEntries={[`/routines/${routineId}`]}>
          <PhysioApp
            exerciseLibraryClient={stubLibraryClient()}
            exerciseRequestsClient={stubRequestsClient()}
            programsClient={programsClient}
            routinesClient={routinesClient}
          />
        </MemoryRouter>,
      );
      const useButtons = await screen.findAllByRole("button", {
        name: USE_FOR_PATIENT,
      });
      await userEvent.click(useButtons[0]!);
      const dialog = await screen.findByRole("dialog", { name: PUBLISH_SHEET_TITLE });
      const nameField = dialog.querySelector("#pg-publish-name-input");
      expect(nameField).toHaveValue("Knee routine for UI");
      await waitFor(() => {
        expect(
          within(dialog).getByRole("heading", {
            level: 3,
            name: PUBLISH_FIRST_PUBLISH_HEADING,
          }),
        ).toBeInTheDocument();
      });
      const publishNow = within(dialog).getByRole("button", { name: PUBLISH_NOW });
      await waitFor(() => {
        expect(publishNow).toBeEnabled();
      });
      await userEvent.click(publishNow);
      await waitFor(() => {
        expect(screen.getByText(PUBLISHED_NEW_LINK_TOAST)).toBeInTheDocument();
      });
    } finally {
      close();
    }
  }, 20_000);

  it("Create program from routine shows origin banner with View routine", async () => {
    const { routineId, routinesClient, programsClient, close } = await httpClients();
    try {
      render(
        <MemoryRouter initialEntries={[`/routines/${routineId}`]}>
          <PhysioApp
            exerciseLibraryClient={stubLibraryClient()}
            exerciseRequestsClient={stubRequestsClient()}
            programsClient={programsClient}
            routinesClient={routinesClient}
          />
        </MemoryRouter>,
      );
      await userEvent.click(
        await screen.findByRole("button", { name: CREATE_PROGRAM_FROM_ROUTINE }),
      );
      expect(
        await screen.findByText(builderOriginBannerTitle("Knee routine for UI", 1)),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: VIEW_ROUTINE })).toHaveAttribute(
        "href",
        `/routines/${routineId}`,
      );
    } finally {
      close();
    }
  });

  it("Programs list origin filters include From a routine and From scratch", async () => {
    const { routinesClient, programsClient, close } = await httpClients();
    try {
      render(
        <MemoryRouter initialEntries={["/programs"]}>
          <PhysioApp
            exerciseLibraryClient={stubLibraryClient()}
            exerciseRequestsClient={stubRequestsClient()}
            programsClient={programsClient}
            routinesClient={routinesClient}
          />
        </MemoryRouter>,
      );
      await screen.findByRole("group", { name: /Show programs/i });
      expect(
        screen.getByRole("button", { name: FILTER_FROM_ROUTINE }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: FILTER_FROM_SCRATCH }),
      ).toBeInTheDocument();
    } finally {
      close();
    }
  });
});
