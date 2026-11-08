/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { RoutinesClient } from "../../src/ui/api/routines-client.js";
import {
  KEEP_MINE,
  SAVE_MY_COPY,
  SAVE_TO_MY_ROUTINES,
  toastAdoptedVersion,
  toastKeptCopy,
  toastRemovedFromMy,
  toastSavedToMy,
  useVersionN,
} from "../../src/ui/copy/routines.js";
import { TOAST_SAVED_MY_COPY } from "../../src/ui/copy/routines.js";
import { openMigratedDatabase } from "../helpers/exercise-sqlite-fixture.js";
import { seedPractitioner } from "../helpers/exercise-sqlite-fixture.js";
import { id } from "../helpers/opaque-test-ids.js";
import { installRealStaleDeleteCopyFixture } from "../helpers/routines-delete-batch-fixture.js";
import {
  appDepsForRoutinesHttpUi,
  createRoutinesHttpFetch,
  installRealStaleAdoptCopyFixture,
  installRealStaleReplaceMyCopyRowsFixture,
  openFlaggedRoutineHttpUiFixture,
} from "../helpers/routines-http-ui-fixture.js";
import {
  publishRoutine,
  seedTwoPractitioners,
} from "../helpers/from-routine-http-fixture.js";

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

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
  } as unknown as ProgramsClient;
}

function renderDetail(routineId: string, client: RoutinesClient) {
  return render(
    <MemoryRouter initialEntries={[`/routines/${routineId}`]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={stubProgramsClient()}
        routinesClient={client}
      />
    </MemoryRouter>,
  );
}

function renderMyCopy(routineId: string, client: RoutinesClient) {
  return render(
    <MemoryRouter initialEntries={[`/routines/${routineId}/my-copy`]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={stubProgramsClient()}
        routinesClient={client}
      />
    </MemoryRouter>,
  );
}

describe("Routines library mutation failures (HTTP → UI)", () => {
  it("save without session shows mutation error slot and does not reload detail", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("ui-http-save-401-routine");
      await publishRoutine(storage, author, {
        routine: "ui-http-save-401-routine",
        draftVersion: "ui-http-save-401-draft",
        row: "ui-http-save-401-row",
        name: "Save 401 UI",
      });
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "a@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie, { authMutations: false }),
      });
      const getRoutineDetails = vi.spyOn(client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(routineId, client);
      await waitFor(() => {
        expect(screen.getByText("Save 401 UI")).toBeInTheDocument();
      });
      expect(getRoutineDetails).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: SAVE_TO_MY_ROUTINES }));
      await waitFor(() => {
        expect(
          document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(toastSavedToMy("Save 401 UI"))).not.toBeInTheDocument();
      expect(getRoutineDetails).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });

  it("generic save HTTP failure shows mutation error slot without success toast", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("ui-http-save-500-routine");
      await publishRoutine(storage, author, {
        routine: "ui-http-save-500-routine",
        draftVersion: "ui-http-save-500-draft",
        row: "ui-http-save-500-row",
        name: "Save 500 UI",
      });
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "a@example.com",
      );
      const baseFetch = createRoutinesHttpFetch(deps, cookie);
      const client = new RoutinesClient({
        fetchFn: async (input, init) => {
          const method = (init?.method ?? "GET").toUpperCase();
          if (method === "POST") {
            return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
          }
          return baseFetch(input, init);
        },
      });
      const getRoutineDetails = vi.spyOn(client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(routineId, client);
      await waitFor(() => {
        expect(screen.getByText("Save 500 UI")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: SAVE_TO_MY_ROUTINES }));
      await waitFor(() => {
        expect(
          document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(toastSavedToMy("Save 500 UI"))).not.toBeInTheDocument();
      expect(getRoutineDetails).toHaveBeenCalledTimes(1);
    } finally {
      storage.close();
    }
  });

  it("remove stale_write over HTTP shows error slot, keeps saved state, no success toast", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("remove-409");
    try {
      const wrong = await seedPractitioner(
        fixture.storage,
        id("ui-http-remove-wrong"),
        "remove-wrong@example.com",
      );
      const restore = installRealStaleDeleteCopyFixture(wrong);
      const getRoutineDetails = vi.spyOn(fixture.client, "getRoutineDetails");
      try {
        const user = userEvent.setup();
        renderDetail(fixture.routineId, fixture.client);
        await waitFor(() => {
          expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
        });
        expect(getRoutineDetails).toHaveBeenCalledTimes(1);
        await user.click(
          screen.getByRole("button", { name: "Remove from My routines" }),
        );
        await waitFor(() => {
          expect(
            document.querySelector(
              '[data-testid="routine-detail-mutation-error-slot"]',
            ),
          ).toBeInTheDocument();
        });
        expect(
          screen.queryByText(toastRemovedFromMy("UI HTTP remove-409")),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Remove from My routines" }),
        ).toBeInTheDocument();
        expect(getRoutineDetails).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    } finally {
      fixture.storage.close();
    }
  });

  it("adopt stale_write over HTTP shows error slot without adopt success toast or reload", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("adopt-409");
    try {
      const details = await fixture.client.getRoutineDetails(fixture.routineId);
      const version = details.community.version_number;
      const wrong = await seedPractitioner(
        fixture.storage,
        id("ui-http-adopt-wrong"),
        "adopt-wrong@example.com",
      );
      const restore = installRealStaleAdoptCopyFixture(wrong);
      const getRoutineDetails = vi.spyOn(fixture.client, "getRoutineDetails");
      try {
        const user = userEvent.setup();
        renderDetail(fixture.routineId, fixture.client);
        await waitFor(() => {
          expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
        });
        expect(getRoutineDetails).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole("button", { name: useVersionN(version) }));
        await waitFor(() => {
          expect(
            document.querySelector(
              '[data-testid="routine-detail-mutation-error-slot"]',
            ),
          ).toBeInTheDocument();
        });
        expect(
          screen.queryByText(toastAdoptedVersion(version)),
        ).not.toBeInTheDocument();
        expect(getRoutineDetails).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    } finally {
      fixture.storage.close();
    }
  });

  it("keep without session shows mutation error slot and no kept toast", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("keep-401");
    try {
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(fixture.deps, fixture.cookie, {
          authMutations: false,
        }),
      });
      const getRoutineDetails = vi.spyOn(client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(fixture.routineId, client);
      await waitFor(() => {
        expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
      });
      expect(getRoutineDetails).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole("button", { name: KEEP_MINE }));
      await waitFor(() => {
        expect(
          document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(toastKeptCopy(1))).not.toBeInTheDocument();
      expect(getRoutineDetails).toHaveBeenCalledTimes(1);
    } finally {
      fixture.storage.close();
    }
  });

  it("my-copy PATCH stale_write over HTTP shows error slot and stays on editor", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("patch-409");
    try {
      const wrong = await seedPractitioner(
        fixture.storage,
        id("ui-http-patch-wrong"),
        "patch-wrong@example.com",
      );
      const restore = installRealStaleReplaceMyCopyRowsFixture(wrong);
      const getRoutineDetails = vi.spyOn(fixture.client, "getRoutineDetails");
      try {
        const user = userEvent.setup();
        renderMyCopy(fixture.routineId, fixture.client);
        const hold = await screen.findByTestId("rt-hold-0");
        await user.clear(hold);
        await user.type(hold, "55");
        expect(getRoutineDetails).toHaveBeenCalledTimes(1);
        await user.click(screen.getByTestId("save-my-copy"));
        await waitFor(() => {
          expect(
            document.querySelector(
              '[data-testid="routine-my-copy-mutation-error-slot"]',
            ),
          ).toBeInTheDocument();
        });
        expect(screen.queryByText(TOAST_SAVED_MY_COPY)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: SAVE_MY_COPY })).toBeInTheDocument();
        expect(getRoutineDetails).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    } finally {
      fixture.storage.close();
    }
  });

  it("my-copy PATCH generic HTTP failure shows error slot with no navigation", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("patch-500");
    try {
      const baseFetch = createRoutinesHttpFetch(fixture.deps, fixture.cookie);
      const client = new RoutinesClient({
        fetchFn: async (input, init) => {
          const method = (init?.method ?? "GET").toUpperCase();
          if (method === "PATCH") {
            return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
          }
          return baseFetch(input, init);
        },
      });
      const user = userEvent.setup();
      renderMyCopy(fixture.routineId, client);
      const hold = await screen.findByTestId("rt-hold-0");
      await user.clear(hold);
      await user.type(hold, "55");
      await user.click(screen.getByTestId("save-my-copy"));
      await waitFor(() => {
        expect(
          document.querySelector('[data-testid="routine-my-copy-mutation-error-slot"]'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(TOAST_SAVED_MY_COPY)).not.toBeInTheDocument();
      expect(screen.getByTestId("save-my-copy")).toBeInTheDocument();
    } finally {
      fixture.storage.close();
    }
  });

  it("remove without saved copy returns my_routine_not_found over HTTP client", async () => {
    const storage = await openMigratedDatabase();
    try {
      const { practitionerA: author } = await seedTwoPractitioners(storage);
      const routineId = id("ui-http-own-remove");
      await publishRoutine(storage, author, {
        routine: "ui-http-own-remove",
        draftVersion: "ui-http-own-remove-draft",
        row: "ui-http-own-remove-row",
        name: "Ownership remove",
      });
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "a@example.com",
      );
      const client = new RoutinesClient({
        fetchFn: createRoutinesHttpFetch(deps, cookie),
      });
      await expect(client.removeFromMyRoutines(routineId)).rejects.toThrow();
    } finally {
      storage.close();
    }
  });
});
