/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { PhysioApp } from "../../src/ui/App.js";
import { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";
import { ExerciseRequestsClient } from "../../src/ui/api/exercise-requests-client.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { RoutinesClient, type FetchFn } from "../../src/ui/api/routines-client.js";
import { ROUTINES_AUTHORING_COLLECTION_PATH } from "../../src/routine-authoring-api-paths.js";
import { openMigratedDatabase } from "../helpers/exercise-sqlite-fixture.js";
import { seedPractitioner } from "../helpers/exercise-sqlite-fixture.js";
import { id } from "../helpers/opaque-test-ids.js";
import {
  appDepsForRoutinesHttpUi,
  createRoutinesHttpFetch,
} from "../helpers/routines-http-ui-fixture.js";

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
    getExerciseDetails: vi.fn(),
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

const LOCATION_PROBE = "location-spy";
const ROUTINE_SETUP_DELAY_MS = 250;
const locationHistory: string[] = [];

function LocationSpy() {
  const location = useLocation();
  useEffect(() => {
    locationHistory.push(location.pathname);
  }, [location.pathname]);
  return <div data-testid={LOCATION_PROBE}>{location.pathname}</div>;
}

function expectLocationHistoryNeverIncludesDraftEdit() {
  expect(
    locationHistory.some((pathname) => /\/routines\/[^/]+\/edit$/.test(pathname)),
  ).toBe(false);
}

beforeEach(() => {
  locationHistory.length = 0;
});

function requestPath(input: RequestInfo | URL): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? `${input.pathname}${input.search}`
        : input.url;
  if (raw.startsWith("http")) {
    return new URL(raw).pathname;
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

type DelayRule = {
  method: "POST" | "PATCH";
  match: (pathname: string) => boolean;
};

function withDelay(baseFetch: FetchFn, rule: DelayRule): FetchFn {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = requestPath(input);
    if (method === rule.method && rule.match(pathname)) {
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS);
      });
    }
    return baseFetch(input, init);
  };
}

function withDelayedUntouchedCancelDelete(baseFetch: FetchFn): FetchFn {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = requestPath(input);
    if (
      method === "DELETE" &&
      pathname.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`)
    ) {
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS);
      });
    }
    return baseFetch(input, init);
  };
}

type TrackingClientParts = {
  client: RoutinesClient;
  deleteRoutineIds: string[];
  createdRoutineId: { current: string };
};

function buildTrackingClient(
  baseFetch: FetchFn,
  delays: { post?: boolean; patch?: boolean; delayedDelete?: boolean },
): TrackingClientParts {
  let fetch = baseFetch;
  if (delays.delayedDelete) {
    fetch = withDelayedUntouchedCancelDelete(fetch);
  }
  if (delays.post) {
    fetch = withDelay(fetch, {
      method: "POST",
      match: (p) => p === ROUTINES_AUTHORING_COLLECTION_PATH,
    });
  }
  if (delays.patch) {
    fetch = withDelay(fetch, {
      method: "PATCH",
      match: (p) =>
        p.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`) &&
        p !== ROUTINES_AUTHORING_COLLECTION_PATH,
    });
  }
  const deleteRoutineIds: string[] = [];
  const createdRoutineId = { current: "" };
  const trackingFetch: FetchFn = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = requestPath(input);
    const response = await fetch(input, init);
    if (method === "POST" && pathname === ROUTINES_AUTHORING_COLLECTION_PATH) {
      const clone = response.clone();
      const body = (await clone.json()) as { routine_id: string };
      createdRoutineId.current = body.routine_id;
    }
    if (
      method === "DELETE" &&
      pathname.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`)
    ) {
      deleteRoutineIds.push(pathname.split("/").pop() ?? "");
    }
    return response;
  };
  return {
    client: new RoutinesClient({ fetchFn: trackingFetch }),
    deleteRoutineIds,
    createdRoutineId,
  };
}

function renderApp(
  path: string,
  client: RoutinesClient,
  options: { historyEntries?: string[]; historyIndex?: number } = {},
) {
  const entries = options.historyEntries ?? [path];
  const initialIndex = options.historyIndex ?? entries.length - 1;
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
      <LocationSpy />
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        programsClient={stubProgramsClient()}
        routinesClient={client}
      />
    </MemoryRouter>,
  );
}

function bodyRegionGroup() {
  return screen.getByRole("group", { name: "Body region" });
}

async function assertStaysOnRoutinesListThroughSetupDelay() {
  const deadline = Date.now() + ROUTINE_SETUP_DELAY_MS + 2_000;
  while (Date.now() < deadline) {
    const pathname = screen.getByTestId(LOCATION_PROBE).textContent ?? "";
    expect(pathname).toBe("/routines");
    expect(pathname).not.toMatch(/\/routines\/[^/]+\/edit$/);
    expect(screen.getByTestId("routines-page")).toBeTruthy();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}

async function assertExactlyOneDeleteAfterSetupSettles(
  deleteRoutineIds: string[],
  createdRoutineId: string,
) {
  await waitFor(
    () => {
      expect(createdRoutineId.length).toBeGreaterThan(0);
      expect(deleteRoutineIds).toEqual([createdRoutineId]);
    },
    { timeout: 10_000 },
  );
  await new Promise((resolve) => {
    setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 350);
  });
  expect(deleteRoutineIds).toEqual([createdRoutineId]);
}

async function assertDraftRemovedFromServer(client: RoutinesClient, routineId: string) {
  try {
    await client.getRoutineDetails(routineId);
    expect.fail("expected draft to be removed from server");
  } catch (error) {
    expect(error).toMatchObject({ code: "routine_not_found" });
  }
}

async function clickPageBackToRoutines() {
  const backLinks = screen.getAllByRole("link", { name: "Routines" });
  const backLink = backLinks.find((link) => link.className.includes("ex-back-link"));
  expect(backLink).toBeTruthy();
  await userEvent.click(backLink!);
}

async function clickShellRoutinesNav() {
  const navLinks = screen.getAllByRole("link", { name: "Routines" });
  const shellNav = navLinks.find((link) => link.className.includes("shell-tab-link"));
  expect(shellNav).toBeTruthy();
  await userEvent.click(shellNav!);
}

describe("Routine authoring new-draft setup cancel (DIDI-1230)", () => {
  afterEach(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 350);
    });
  });

  it("Cancel during delayed POST stays on /routines, skips editor, deletes draft once", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-post"),
        "post-delay@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "post-delay@example.com",
      );
      const { client, deleteRoutineIds, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { post: true, delayedDelete: true },
      );
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await assertStaysOnRoutinesListThroughSetupDelay();
      await assertExactlyOneDeleteAfterSetupSettles(
        deleteRoutineIds,
        createdRoutineId.current,
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      expect((await client.listMyRoutines()).drafts.length).toBe(0);
      await assertDraftRemovedFromServer(client, createdRoutineId.current);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("Cancel during delayed PATCH stays on /routines, skips editor, deletes draft once", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-patch"),
        "patch-delay@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "patch-delay@example.com",
      );
      const { client, deleteRoutineIds, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { patch: true, delayedDelete: true },
      );
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await waitFor(
        () => {
          expect(createdRoutineId.current.length).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await assertStaysOnRoutinesListThroughSetupDelay();
      await assertExactlyOneDeleteAfterSetupSettles(
        deleteRoutineIds,
        createdRoutineId.current,
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      expect((await client.listMyRoutines()).drafts.length).toBe(0);
      await assertDraftRemovedFromServer(client, createdRoutineId.current);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("Routines back link during delayed POST leaves /routines and deletes untouched draft once", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-back-post"),
        "back-post@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "back-post@example.com",
      );
      const { client, deleteRoutineIds, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { post: true, delayedDelete: true },
      );
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await clickPageBackToRoutines();
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await assertStaysOnRoutinesListThroughSetupDelay();
      await assertExactlyOneDeleteAfterSetupSettles(
        deleteRoutineIds,
        createdRoutineId.current,
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      expect((await client.listMyRoutines()).drafts.length).toBe(0);
      await assertDraftRemovedFromServer(client, createdRoutineId.current);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("Routines back link during delayed PATCH leaves /routines and deletes untouched draft once", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-back-patch"),
        "back-patch@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "back-patch@example.com",
      );
      const { client, deleteRoutineIds, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { patch: true, delayedDelete: true },
      );
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await waitFor(
        () => {
          expect(createdRoutineId.current.length).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      await clickPageBackToRoutines();
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await assertStaysOnRoutinesListThroughSetupDelay();
      await assertExactlyOneDeleteAfterSetupSettles(
        deleteRoutineIds,
        createdRoutineId.current,
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      expect((await client.listMyRoutines()).drafts.length).toBe(0);
      await assertDraftRemovedFromServer(client, createdRoutineId.current);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("shell Routines nav during delayed POST leaves /routines and deletes untouched draft once", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-shell-post"),
        "shell-post@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "shell-post@example.com",
      );
      const { client, deleteRoutineIds, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { post: true, delayedDelete: true },
      );
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await clickShellRoutinesNav();
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await assertStaysOnRoutinesListThroughSetupDelay();
      await assertExactlyOneDeleteAfterSetupSettles(
        deleteRoutineIds,
        createdRoutineId.current,
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      expect((await client.listMyRoutines()).drafts.length).toBe(0);
      await assertDraftRemovedFromServer(client, createdRoutineId.current);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("shell Routines nav during delayed PATCH leaves /routines and deletes untouched draft once", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-shell-patch"),
        "shell-patch@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "shell-patch@example.com",
      );
      const { client, deleteRoutineIds, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { patch: true, delayedDelete: true },
      );
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await waitFor(
        () => {
          expect(createdRoutineId.current.length).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      await clickShellRoutinesNav();
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await assertStaysOnRoutinesListThroughSetupDelay();
      await assertExactlyOneDeleteAfterSetupSettles(
        deleteRoutineIds,
        createdRoutineId.current,
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      expect((await client.listMyRoutines()).drafts.length).toBe(0);
      await assertDraftRemovedFromServer(client, createdRoutineId.current);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("Done for now during delayed POST skips editor and keeps touched draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-done-post"),
        "done-post@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "done-post@example.com",
      );
      const { client, deleteRoutineIds } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { post: true },
      );
      const routineName = "Knee mobility";
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Knee osteoarthritis, starter"),
        ).toBeTruthy();
      });
      await userEvent.type(
        screen.getByPlaceholderText("Knee osteoarthritis, starter"),
        routineName,
      );
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Done for now" }));
      await waitFor(
        () => {
          const pathname = screen.getByTestId(LOCATION_PROBE).textContent ?? "";
          expect(pathname).toMatch(/^\/routines\/[^/]+$/);
          expect(pathname).not.toMatch(/\/edit$/);
        },
        { timeout: 10_000 },
      );
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 500);
      });
      expectLocationHistoryNeverIncludesDraftEdit();
      expect(deleteRoutineIds.length).toBe(0);
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(1);
      const details = await client.getRoutineDetails(list.drafts[0]!.routine_id);
      expect(details.draft!.name).toBe(routineName);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("Done for now during delayed PATCH skips editor and keeps touched draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-done-patch"),
        "done-patch@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "done-patch@example.com",
      );
      const { client, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { patch: true },
      );
      const routineName = "Knee mobility";
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Knee osteoarthritis, starter"),
        ).toBeTruthy();
      });
      await userEvent.type(
        screen.getByPlaceholderText("Knee osteoarthritis, starter"),
        routineName,
      );
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await waitFor(
        () => {
          expect(createdRoutineId.current.length).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      await userEvent.click(screen.getByRole("button", { name: "Done for now" }));
      await waitFor(
        () => {
          const pathname = screen.getByTestId(LOCATION_PROBE).textContent ?? "";
          expect(pathname).toMatch(/^\/routines\/[^/]+$/);
          expect(pathname).not.toMatch(/\/edit$/);
        },
        { timeout: 10_000 },
      );
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 500);
      });
      expectLocationHistoryNeverIncludesDraftEdit();
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(1);
      const details = await client.getRoutineDetails(list.drafts[0]!.routine_id);
      expect(details.draft!.name).toBe(routineName);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("touched name after knee during delayed POST leaves draft on server", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-touch-post"),
        "touch-post@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "touch-post@example.com",
      );
      const { client, deleteRoutineIds } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { post: true },
      );
      const routineName = "Knee mobility";
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Knee osteoarthritis, starter"),
        ).toBeTruthy();
      });
      const nameInput = screen.getByPlaceholderText("Knee osteoarthritis, starter");
      await userEvent.click(nameInput);
      await userEvent.paste(routineName);
      await waitFor(() => {
        expect(screen.getByDisplayValue(routineName)).toBeTruthy();
      });
      await userEvent.click(screen.getByRole("button", { name: "Done for now" }));
      await waitFor(
        () => {
          const pathname = screen.getByTestId(LOCATION_PROBE).textContent ?? "";
          expect(pathname).toMatch(/^\/routines\/[^/]+$/);
        },
        { timeout: 10_000 },
      );
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 500);
      });
      expect(deleteRoutineIds.length).toBe(0);
      expectLocationHistoryNeverIncludesDraftEdit();
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(1);
      const details = await client.getRoutineDetails(list.drafts[0]!.routine_id);
      expect(details.draft!.name).toBe(routineName);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("touched shell nav during delayed POST does not delete draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-touch-nav"),
        "touch-nav@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "touch-nav@example.com",
      );
      const { client, deleteRoutineIds } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { post: true },
      );
      const routineName = "Knee mobility";
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Knee osteoarthritis, starter"),
        ).toBeTruthy();
      });
      const nameInput = screen.getByPlaceholderText("Knee osteoarthritis, starter");
      await userEvent.click(nameInput);
      await userEvent.paste(routineName);
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await clickShellRoutinesNav();
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 500);
      });
      expect(deleteRoutineIds.length).toBe(0);
      expect((await client.listMyRoutines()).drafts.length).toBe(1);
    } finally {
      storage.close();
    }
  }, 20_000);

  it("touched name after id during delayed PATCH leaves draft on server", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-touch-patch"),
        "touch-patch@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "touch-patch@example.com",
      );
      const { client, deleteRoutineIds, createdRoutineId } = buildTrackingClient(
        createRoutinesHttpFetch(deps, cookie),
        { patch: true },
      );
      const routineName = "Knee mobility";
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(bodyRegionGroup()).toBeTruthy();
      });
      void userEvent.click(
        within(bodyRegionGroup()).getByRole("button", { name: "Knee" }),
      );
      await waitFor(
        () => {
          expect(createdRoutineId.current.length).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      const nameInput = screen.getByPlaceholderText("Knee osteoarthritis, starter");
      await userEvent.click(nameInput);
      await userEvent.paste(routineName);
      await waitFor(() => {
        expect(screen.getByDisplayValue(routineName)).toBeTruthy();
      });
      await userEvent.click(screen.getByRole("button", { name: "Done for now" }));
      await waitFor(
        () => {
          const pathname = screen.getByTestId(LOCATION_PROBE).textContent ?? "";
          expect(pathname).toMatch(/^\/routines\/[^/]+$/);
        },
        { timeout: 10_000 },
      );
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 500);
      });
      expect(deleteRoutineIds.length).toBe(0);
      expectLocationHistoryNeverIncludesDraftEdit();
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(1);
      const details = await client.getRoutineDetails(createdRoutineId.current);
      expect(details.draft!.name).toBe(routineName);
    } finally {
      storage.close();
    }
  }, 20_000);
});
