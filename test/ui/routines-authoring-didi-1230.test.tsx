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
import {
  BACK_ROUTINES,
  BODY_REGION,
  ROUTINE_NAME_PLACEHOLDER,
} from "../../src/ui/copy/routines.js";
import { CANCEL } from "../../src/ui/copy/my-defaults.js";
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

function expectNeverOnDraftEditPath() {
  const pathname = screen.getByTestId(LOCATION_PROBE).textContent ?? "";
  expect(pathname).not.toMatch(/\/routines\/[^/]+\/edit$/);
}

async function assertStaysOnRoutinesListThroughSetupDelay() {
  await waitFor(
    () => {
      const pathname = screen.getByTestId(LOCATION_PROBE).textContent ?? "";
      expect(pathname).toBe("/routines");
      expect(pathname).not.toMatch(/\/routines\/[^/]+\/edit$/);
      expect(screen.getByTestId("routines-page")).toBeTruthy();
    },
    { timeout: ROUTINE_SETUP_DELAY_MS + 2_000 },
  );
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
      const baseFetch = createRoutinesHttpFetch(deps, cookie);
      const delayedFetch = withDelay(withDelayedUntouchedCancelDelete(baseFetch), {
        method: "POST",
        match: (p) => p === ROUTINES_AUTHORING_COLLECTION_PATH,
      });
      const deleteRoutineIds: string[] = [];
      let createdRoutineId = "";
      const trackingFetch: FetchFn = async (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        const pathname = requestPath(input);
        const response = await delayedFetch(input, init);
        if (method === "POST" && pathname === ROUTINES_AUTHORING_COLLECTION_PATH) {
          const clone = response.clone();
          const body = (await clone.json()) as { routine_id: string };
          createdRoutineId = body.routine_id;
        }
        if (
          method === "DELETE" &&
          pathname.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`)
        ) {
          deleteRoutineIds.push(pathname.split("/").pop() ?? "");
        }
        return response;
      };
      const client = new RoutinesClient({ fetchFn: trackingFetch });
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(screen.getByRole("group", { name: BODY_REGION })).toBeTruthy();
      });
      const group = screen.getByRole("group", { name: BODY_REGION });
      void userEvent.click(within(group).getByRole("button", { name: "Knee" }));
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      expectNeverOnDraftEditPath();
      await assertStaysOnRoutinesListThroughSetupDelay();
      await waitFor(
        () => {
          expect(createdRoutineId.length).toBeGreaterThan(0);
          expect(deleteRoutineIds).toEqual([createdRoutineId]);
        },
        { timeout: 10_000 },
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(0);
      try {
        await client.getRoutineDetails(createdRoutineId);
        expect.fail("expected draft to be removed from server");
      } catch (error) {
        expect(error).toMatchObject({ code: "routine_not_found" });
      }
    } finally {
      storage.close();
    }
  }, 15_000);

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
      const baseFetch = createRoutinesHttpFetch(deps, cookie);
      const delayedFetch = withDelay(withDelayedUntouchedCancelDelete(baseFetch), {
        method: "PATCH",
        match: (p) =>
          p.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`) &&
          p !== ROUTINES_AUTHORING_COLLECTION_PATH,
      });
      const deleteRoutineIds: string[] = [];
      let createdRoutineId = "";
      const trackingFetch: FetchFn = async (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        const pathname = requestPath(input);
        const response = await delayedFetch(input, init);
        if (method === "POST" && pathname === ROUTINES_AUTHORING_COLLECTION_PATH) {
          const clone = response.clone();
          const body = (await clone.json()) as { routine_id: string };
          createdRoutineId = body.routine_id;
        }
        if (
          method === "DELETE" &&
          pathname.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`)
        ) {
          deleteRoutineIds.push(pathname.split("/").pop() ?? "");
        }
        return response;
      };
      const client = new RoutinesClient({ fetchFn: trackingFetch });
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(screen.getByRole("group", { name: BODY_REGION })).toBeTruthy();
      });
      const group = screen.getByRole("group", { name: BODY_REGION });
      void userEvent.click(within(group).getByRole("button", { name: "Knee" }));
      await waitFor(
        () => {
          expect(createdRoutineId.length).toBeGreaterThan(0);
        },
        { timeout: 5_000 },
      );
      await userEvent.click(screen.getByRole("button", { name: CANCEL }));
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      expectNeverOnDraftEditPath();
      await assertStaysOnRoutinesListThroughSetupDelay();
      await waitFor(
        () => {
          expect(deleteRoutineIds).toEqual([createdRoutineId]);
        },
        { timeout: 10_000 },
      );
      expectLocationHistoryNeverIncludesDraftEdit();
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(0);
      try {
        await client.getRoutineDetails(createdRoutineId);
        expect.fail("expected draft to be removed from server");
      } catch (error) {
        expect(error).toMatchObject({ code: "routine_not_found" });
      }
    } finally {
      storage.close();
    }
  }, 15_000);

  it("Routines back link during delayed POST leaves /routines and deletes untouched draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-nav"),
        "nav-delay@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "nav-delay@example.com",
      );
      const baseFetch = createRoutinesHttpFetch(deps, cookie);
      const delayedFetch = withDelay(baseFetch, {
        method: "POST",
        match: (p) => p === ROUTINES_AUTHORING_COLLECTION_PATH,
      });
      const deleteRoutineIds: string[] = [];
      const trackingFetch: FetchFn = async (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        const pathname = requestPath(input);
        const response = await delayedFetch(input, init);
        if (
          method === "DELETE" &&
          pathname.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`)
        ) {
          deleteRoutineIds.push(pathname.split("/").pop() ?? "");
        }
        return response;
      };
      const client = new RoutinesClient({ fetchFn: trackingFetch });
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(screen.getByRole("group", { name: BODY_REGION })).toBeTruthy();
      });
      const group = screen.getByRole("group", { name: BODY_REGION });
      void userEvent.click(within(group).getByRole("button", { name: "Knee" }));
      const backLinks = screen.getAllByRole("link", { name: BACK_ROUTINES });
      const backLink = backLinks.find((link) =>
        link.className.includes("ex-back-link"),
      );
      expect(backLink).toBeTruthy();
      await userEvent.click(backLink!);
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      expectNeverOnDraftEditPath();
      await assertStaysOnRoutinesListThroughSetupDelay();
      await waitFor(() => {
        expect(deleteRoutineIds.length).toBe(1);
      });
      expectLocationHistoryNeverIncludesDraftEdit();
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(0);
    } finally {
      storage.close();
    }
  }, 15_000);

  it("shell Routines nav during delayed PATCH leaves /routines and deletes untouched draft", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-nav-patch"),
        "nav-patch@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "nav-patch@example.com",
      );
      const baseFetch = createRoutinesHttpFetch(deps, cookie);
      const delayedFetch = withDelay(baseFetch, {
        method: "PATCH",
        match: (p) =>
          p.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`) &&
          p !== ROUTINES_AUTHORING_COLLECTION_PATH,
      });
      const deleteRoutineIds: string[] = [];
      const trackingFetch: FetchFn = async (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        const pathname = requestPath(input);
        const response = await delayedFetch(input, init);
        if (
          method === "DELETE" &&
          pathname.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`)
        ) {
          deleteRoutineIds.push(pathname.split("/").pop() ?? "");
        }
        return response;
      };
      const client = new RoutinesClient({ fetchFn: trackingFetch });
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(screen.getByRole("group", { name: BODY_REGION })).toBeTruthy();
      });
      const group = screen.getByRole("group", { name: BODY_REGION });
      void userEvent.click(within(group).getByRole("button", { name: "Knee" }));
      const navLinks = screen.getAllByRole("link", { name: BACK_ROUTINES });
      const shellNav = navLinks.find((link) =>
        link.className.includes("shell-tab-link"),
      );
      expect(shellNav).toBeTruthy();
      await userEvent.click(shellNav!);
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
      });
      expectNeverOnDraftEditPath();
      await assertStaysOnRoutinesListThroughSetupDelay();
      await waitFor(() => {
        expect(deleteRoutineIds.length).toBe(1);
      });
      expectLocationHistoryNeverIncludesDraftEdit();
      const list = await client.listMyRoutines();
      expect(list.drafts.length).toBe(0);
    } finally {
      storage.close();
    }
  }, 15_000);

  it("does not delete a touched draft when the user edits mid-chain then leaves", async () => {
    const storage = await openMigratedDatabase();
    try {
      const author = await seedPractitioner(
        storage,
        id("ui-1230-touch"),
        "touch-mid@example.com",
      );
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        storage,
        author,
        "touch-mid@example.com",
      );
      const baseFetch = createRoutinesHttpFetch(deps, cookie);
      const delayedFetch = withDelay(baseFetch, {
        method: "PATCH",
        match: (p) =>
          p.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`) &&
          p !== ROUTINES_AUTHORING_COLLECTION_PATH,
      });
      let deleteCount = 0;
      const trackingFetch: FetchFn = async (input, init) => {
        const method = (init?.method ?? "GET").toUpperCase();
        const pathname = requestPath(input);
        const response = await delayedFetch(input, init);
        if (
          method === "DELETE" &&
          pathname.startsWith(`${ROUTINES_AUTHORING_COLLECTION_PATH}/`)
        ) {
          deleteCount += 1;
        }
        return response;
      };
      const client = new RoutinesClient({ fetchFn: trackingFetch });
      const routineName = "Knee mobility";
      renderApp("/routines/new", client);
      await waitFor(() => {
        expect(screen.getByPlaceholderText(ROUTINE_NAME_PLACEHOLDER)).toBeTruthy();
      });
      const nameInput = screen.getByPlaceholderText(ROUTINE_NAME_PLACEHOLDER);
      await userEvent.type(nameInput, routineName);
      const group = screen.getByRole("group", { name: BODY_REGION });
      void userEvent.click(within(group).getByRole("button", { name: "Knee" }));
      const navLinks = screen.getAllByRole("link", { name: BACK_ROUTINES });
      const shellNav = navLinks.find((link) =>
        link.className.includes("shell-tab-link"),
      );
      expect(shellNav).toBeTruthy();
      await userEvent.click(shellNav!);
      await waitFor(() => {
        expect(screen.getByTestId("routines-page")).toBeTruthy();
        expect(screen.getByTestId(LOCATION_PROBE)).toHaveTextContent("/routines");
      });
      await waitFor(
        async () => {
          const list = await client.listMyRoutines();
          expect(list.drafts.length).toBe(1);
        },
        { timeout: 10_000 },
      );
      expect(deleteCount).toBe(0);
      const list = await client.listMyRoutines();
      const routineId = list.drafts[0]!.routine_id;
      const details = await client.getRoutineDetails(routineId);
      expect(details.draft).not.toBeNull();
      expect(details.draft!.name).toBe(routineName);
      await new Promise((resolve) => {
        setTimeout(resolve, ROUTINE_SETUP_DELAY_MS + 200);
      });
    } finally {
      storage.close();
    }
  }, 15_000);
});
