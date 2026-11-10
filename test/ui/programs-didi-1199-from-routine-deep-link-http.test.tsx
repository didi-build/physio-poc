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
import { ProgramsApiError, ProgramsClient } from "../../src/ui/api/programs-client.js";
import { RoutinesClient } from "../../src/ui/api/routines-client.js";
import {
  CREATE_PROGRAM_FROM_ROUTINE_ACTION,
  NEW_PROGRAM_ROUTINE_PICKER_TITLE,
  builderOriginBannerTitle,
} from "../../src/ui/copy/programs.js";
import { openMigratedDatabase } from "../helpers/exercise-sqlite-fixture.js";
import {
  publishRoutine,
  seedTwoPractitioners,
} from "../helpers/from-routine-http-fixture.js";
import { id } from "../helpers/opaque-test-ids.js";
import {
  RoutineVersionRowsRepository,
  RoutinesRepository,
} from "../../src/storage/repositories/routines.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  TS,
} from "../helpers/exercise-sqlite-fixture.js";
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

async function programCount(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
): Promise<number> {
  const row = await storage.first<{ c: number }>(
    "SELECT COUNT(*) AS c FROM programs WHERE created_by = ? AND deleted_at IS NULL",
    [practitionerId],
  );
  return row?.c ?? 0;
}

async function seedDraftOnly(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  author: string,
  seeds: { routine: string; draftVersion: string; row: string },
): Promise<string> {
  const routines = new RoutinesRepository(storage);
  const rows = new RoutineVersionRowsRepository(storage);
  const routineId = id(seeds.routine);
  const draftVersionId = id(seeds.draftVersion);
  const rowId = id(seeds.row);
  await routines.createDraft({
    id: routineId,
    draftVersionId,
    createdBy: author,
    createdAt: TS,
    bodyRegionId: "br-knee",
  });
  await rows.replaceDraftRow({
    id: rowId,
    routineId,
    authorId: author,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
    draftUpdatedAt: TS,
  });
  return routineId;
}

async function httpClients() {
  const storage = await openMigratedDatabase();
  const { practitionerA } = await seedTwoPractitioners(storage);
  await publishRoutine(storage, practitionerA, {
    routine: "ui-1199-routine",
    draftVersion: "ui-1199-draft",
    row: "ui-1199-row",
    name: "Knee routine for UI",
    hold_s: 25,
  });
  const routineId = id("ui-1199-routine");
  const { deps, cookie } = appDepsForRoutinesHttpUi(
    storage,
    practitionerA,
    "a@example.com",
  );
  const fetchFn = createRoutinesHttpFetch(deps, cookie);
  const routinesClient = new RoutinesClient({ fetchFn });
  const programsInner = new ProgramsClient({ fetchFn });
  const createFromRoutineSpy = vi.spyOn(programsInner, "createProgramFromRoutine");
  const programsClient = wrapProgramsClientWithCacheInvalidation(programsInner);
  return {
    storage,
    practitionerA,
    routineId,
    routinesClient,
    programsClient,
    createFromRoutineSpy,
    close: () => storage.close(),
  };
}

function deepLinkApp(
  routineId: string,
  programsClient: ProgramsClient,
  routinesClient: RoutinesClient,
) {
  return (
    <MemoryRouter initialEntries={[`/programs/new?from_routine_id=${routineId}`]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={programsClient}
        routinesClient={routinesClient}
      />
    </MemoryRouter>
  );
}

describe("Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP)", () => {
  it("does not POST on load or re-render; preselects the routine; POSTs once on tap", async () => {
    const {
      storage,
      practitionerA,
      routineId,
      routinesClient,
      programsClient,
      createFromRoutineSpy,
      close,
    } = await httpClients();
    try {
      const countBefore = await programCount(storage, practitionerA);
      const { rerender } = render(
        deepLinkApp(routineId, programsClient, routinesClient),
      );

      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(within(dialog).getByText("Knee routine for UI")).toBeInTheDocument();
        expect(
          within(dialog).getByText("Knee routine for UI").closest("button"),
        ).toHaveAttribute("aria-pressed", "true");
      });

      await waitFor(() => {
        expect(createFromRoutineSpy).not.toHaveBeenCalled();
      });
      expect(await programCount(storage, practitionerA)).toBe(countBefore);

      rerender(deepLinkApp(routineId, programsClient, routinesClient));
      await waitFor(() => {
        expect(createFromRoutineSpy).not.toHaveBeenCalled();
      });
      expect(await programCount(storage, practitionerA)).toBe(countBefore);

      const createBtn = within(dialog).getByRole("button", {
        name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
      });
      expect(createBtn).toBeEnabled();
      await userEvent.click(createBtn);

      await waitFor(() => {
        expect(createFromRoutineSpy).toHaveBeenCalledTimes(1);
      });
      expect(await programCount(storage, practitionerA)).toBe(countBefore + 1);
      expect(
        await screen.findByText(builderOriginBannerTitle("Knee routine for UI", 1)),
      ).toBeInTheDocument();
    } finally {
      close();
    }
  });

  it("disables Create program from routine while the POST is in flight", async () => {
    const { routineId, routinesClient, programsClient, createFromRoutineSpy, close } =
      await httpClients();
    try {
      let resolveCreate:
        | ((
            value: Awaited<ReturnType<ProgramsClient["createProgramFromRoutine"]>>,
          ) => void)
        | undefined;
      const createDeferred = new Promise<
        Awaited<ReturnType<ProgramsClient["createProgramFromRoutine"]>>
      >((resolve) => {
        resolveCreate = resolve;
      });
      createFromRoutineSpy.mockImplementation(() => createDeferred);

      render(deepLinkApp(routineId, programsClient, routinesClient));
      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(
          within(dialog).getByRole("button", {
            name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
          }),
        ).toBeEnabled();
      });
      await userEvent.click(
        within(dialog).getByRole("button", {
          name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
        }),
      );
      await waitFor(() => {
        expect(
          within(dialog).getByRole("button", {
            name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
          }),
        ).toBeDisabled();
      });
      expect(createFromRoutineSpy).toHaveBeenCalledTimes(1);
      resolveCreate?.({
        program: {
          program_id: id("prog-suspend"),
          code: "PRG-SUSP",
          name: null,
          created_at: TS,
          draft_updated_at: TS,
          auto_save_status: { kind: "not_published_yet" },
          draft_saved_at: TS,
          exercise_count: 1,
          library_updates_to_review: 0,
          rows: [],
          open_share_link: false,
          share_link_status: "none",
          last_sent_at: null,
          deleted_at: null,
          routine_origin: null,
        },
      });
    } finally {
      close();
    }
  });

  it("preselects and creates from another author published community routine on tap", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      await publishRoutine(storage, practitionerB, {
        routine: "ui-1199-foreign-pub",
        draftVersion: "ui-1199-foreign-pub-draft",
        row: "ui-1199-foreign-pub-row",
        name: "Foreign published routine",
      });
      const foreignId = id("ui-1199-foreign-pub");
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        practitionerA,
        "a@example.com",
      );
      const fetchFn = createRoutinesHttpFetch(deps, cookie);
      const routinesClient = new RoutinesClient({ fetchFn });
      const programsInner = new ProgramsClient({ fetchFn });
      const createFromRoutineSpy = vi.spyOn(programsInner, "createProgramFromRoutine");
      const programsClient = wrapProgramsClientWithCacheInvalidation(programsInner);
      const countBefore = await programCount(storage, practitionerA);

      render(deepLinkApp(foreignId, programsClient, routinesClient));
      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(
          within(dialog).getByText("Foreign published routine").closest("button"),
        ).toHaveAttribute("aria-pressed", "true");
      });
      expect(createFromRoutineSpy).not.toHaveBeenCalled();
      const createBtn = within(dialog).getByRole("button", {
        name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
      });
      await waitFor(() => {
        expect(createBtn).toBeEnabled();
      });
      await userEvent.click(createBtn);
      await waitFor(() => {
        expect(createFromRoutineSpy).toHaveBeenCalledTimes(1);
      });
      expect(await programCount(storage, practitionerA)).toBe(countBefore + 1);
      expect(
        await screen.findByText(
          builderOriginBannerTitle("Foreign published routine", 1),
        ),
      ).toBeInTheDocument();
    } finally {
      storage.close();
    }
  });

  it("preselects a deep-linked routine that is missing from the first search page", async () => {
    const { routineId, routinesClient, programsClient, createFromRoutineSpy, close } =
      await httpClients();
    try {
      vi.spyOn(routinesClient, "searchCommunity").mockResolvedValue({
        routines: [],
        next_cursor: null,
        search_link: null,
        total_count: 0,
        conditions_available: false,
        condition_options: [],
      });

      render(deepLinkApp(routineId, programsClient, routinesClient));
      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(within(dialog).getByText("Knee routine for UI")).toBeInTheDocument();
        expect(
          within(dialog).getByText("Knee routine for UI").closest("button"),
        ).toHaveAttribute("aria-pressed", "true");
      });
      expect(createFromRoutineSpy).not.toHaveBeenCalled();
      const createBtn = within(dialog).getByRole("button", {
        name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
      });
      await waitFor(() => {
        expect(createBtn).toBeEnabled();
      });
    } finally {
      close();
    }
  });

  it("shows the error slot for a missing routine id without any write", async () => {
    const {
      storage,
      practitionerA,
      routinesClient,
      programsClient,
      createFromRoutineSpy,
      close,
    } = await httpClients();
    try {
      const missingId = id("ui-1199-missing-routine");
      const countBefore = await programCount(storage, practitionerA);
      render(deepLinkApp(missingId, programsClient, routinesClient));
      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(document.querySelector(".pg-error-slot")).toBeInTheDocument();
        expect(
          within(dialog).getByRole("button", {
            name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
          }),
        ).toBeDisabled();
      });
      expect(createFromRoutineSpy).not.toHaveBeenCalled();
      expect(await programCount(storage, practitionerA)).toBe(countBefore);
    } finally {
      close();
    }
  });

  it("shows the error slot for another practitioner draft-only routine id without any write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA, practitionerB } = await seedTwoPractitioners(storage);
      const foreignDraftId = await seedDraftOnly(storage, practitionerB, {
        routine: "ui-1199-foreign-draft-routine",
        draftVersion: "ui-1199-foreign-draft-ver",
        row: "ui-1199-foreign-draft-row",
      });
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        practitionerA,
        "a@example.com",
      );
      const fetchFn = createRoutinesHttpFetch(deps, cookie);
      const routinesClient = new RoutinesClient({ fetchFn });
      const programsInner = new ProgramsClient({ fetchFn });
      const createFromRoutineSpy = vi.spyOn(programsInner, "createProgramFromRoutine");
      const programsClient = wrapProgramsClientWithCacheInvalidation(programsInner);
      const countBefore = await programCount(storage, practitionerA);

      render(deepLinkApp(foreignDraftId, programsClient, routinesClient));
      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(document.querySelector(".pg-error-slot")).toBeInTheDocument();
        expect(
          within(dialog).getByRole("button", {
            name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
          }),
        ).toBeDisabled();
      });
      expect(createFromRoutineSpy).not.toHaveBeenCalled();
      expect(await programCount(storage, practitionerA)).toBe(countBefore);
    } finally {
      storage.close();
    }
  });

  it("shows the error slot for an owner draft-only routine id without any write", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA } = await seedTwoPractitioners(storage);
      const draftId = await seedDraftOnly(storage, practitionerA, {
        routine: "ui-1199-draft-routine",
        draftVersion: "ui-1199-draft-ver",
        row: "ui-1199-draft-row",
      });
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        practitionerA,
        "a@example.com",
      );
      const fetchFn = createRoutinesHttpFetch(deps, cookie);
      const routinesClient = new RoutinesClient({ fetchFn });
      const programsInner = new ProgramsClient({ fetchFn });
      const createFromRoutineSpy = vi.spyOn(programsInner, "createProgramFromRoutine");
      const programsClient = wrapProgramsClientWithCacheInvalidation(programsInner);
      const countBefore = await programCount(storage, practitionerA);

      render(deepLinkApp(draftId, programsClient, routinesClient));
      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(document.querySelector(".pg-error-slot")).toBeInTheDocument();
        expect(
          within(dialog).getByRole("button", {
            name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
          }),
        ).toBeDisabled();
      });
      expect(createFromRoutineSpy).not.toHaveBeenCalled();
      expect(await programCount(storage, practitionerA)).toBe(countBefore);
    } finally {
      storage.close();
    }
  });

  it("shows the error slot when create fails with invalid_input after tap", async () => {
    const { routineId, routinesClient, programsClient, createFromRoutineSpy, close } =
      await httpClients();
    try {
      createFromRoutineSpy.mockRejectedValue(
        new ProgramsApiError("invalid_input", "invalid_input"),
      );
      render(deepLinkApp(routineId, programsClient, routinesClient));
      const dialog = await screen.findByRole("dialog", {
        name: NEW_PROGRAM_ROUTINE_PICKER_TITLE,
      });
      await waitFor(() => {
        expect(
          within(dialog).getByRole("button", {
            name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
          }),
        ).toBeEnabled();
      });
      await userEvent.click(
        within(dialog).getByRole("button", {
          name: CREATE_PROGRAM_FROM_ROUTINE_ACTION,
        }),
      );
      await waitFor(() => {
        expect(createFromRoutineSpy).toHaveBeenCalledTimes(1);
        expect(document.querySelector(".pg-error-slot")).toBeInTheDocument();
      });
    } finally {
      close();
    }
  });
});
