/**
 * @vitest-environment jsdom
 *
 * Undo failure coverage uses the real ToastProvider Undo control (AppShell),
 * not captured onUndo callbacks. RoutineDetailsPage routes all mutation Undo
 * handlers through client.applyUndo with the same failure pattern.
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
import { TOAST_UNDO } from "../../src/ui/copy/nav.js";
import {
  KEEP_MINE,
  REMOVE_FROM_MY,
  SAVE_TO_MY_ROUTINES,
  toastAdoptedVersion,
  toastKeptCopy,
  toastRemovedFromMy,
  toastSavedToMy,
  useVersionN,
} from "../../src/ui/copy/routines.js";
import { PractitionerRoutinesRepository } from "../../src/storage/repositories/routines.js";
import { seedPractitioner } from "../helpers/exercise-sqlite-fixture.js";
import { id } from "../helpers/opaque-test-ids.js";
import { installRealStaleDeleteCopyFixture } from "../helpers/routines-delete-batch-fixture.js";
import {
  appDepsForRoutinesHttpUi,
  createRoutinesHttpFetch,
  installRealStaleRestoreSavedCopyFixture,
  openFlaggedRoutineHttpUiFixture,
  openPublishedRoutineNoCopyHttpUiFixture,
} from "../helpers/routines-http-ui-fixture.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";

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
        practitionerSessionClient={stubPractitionerSessionClient()}
      />
    </MemoryRouter>,
  );
}

function createClientWithUndo401(
  deps: Parameters<typeof createRoutinesHttpFetch>[0],
  cookie: string,
): RoutinesClient {
  const authed = createRoutinesHttpFetch(deps, cookie);
  const unauthMutations = createRoutinesHttpFetch(deps, cookie, {
    authMutations: false,
  });
  return new RoutinesClient({
    fetchFn: async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const body = typeof init?.body === "string" ? init.body : "";
      if (method === "POST" && body.includes('"action":"undo"')) {
        return unauthMutations(input, init);
      }
      return authed(input, init);
    },
  });
}

describe("Routines Undo rejection (HTTP → real Toast Undo)", () => {
  it("save → Undo with HTTP 409 on had_copy false keeps durable saved copy, dismisses toast", async () => {
    const fixture = await openPublishedRoutineNoCopyHttpUiFixture("undo-save-409");
    try {
      const wrong = await seedPractitioner(
        fixture.storage,
        id("ui-undo-save-wrong"),
        "undo-save-wrong@example.com",
      );
      const loaded = await fixture.client.getRoutineDetails(fixture.routineId);
      if (loaded.is_draft) {
        throw new Error("expected published routine");
      }
      const routineName = loaded.community.name;
      const getRoutineDetails = vi.spyOn(fixture.client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(fixture.routineId, fixture.client);
      await waitFor(() => {
        expect(screen.getByText(routineName)).toBeInTheDocument();
      });
      const callsAfterInitialLoad = getRoutineDetails.mock.calls.length;
      await user.click(screen.getByRole("button", { name: SAVE_TO_MY_ROUTINES }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: TOAST_UNDO })).toBeInTheDocument();
      });
      expect(screen.getByText(toastSavedToMy(routineName))).toBeInTheDocument();
      const callsAfterSave = getRoutineDetails.mock.calls.length;
      expect(callsAfterSave).toBeGreaterThan(callsAfterInitialLoad);
      const restoreStaleDelete = installRealStaleDeleteCopyFixture(wrong);
      try {
        await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
        await waitFor(() => {
          expect(
            document.querySelector(
              '[data-testid="routine-detail-mutation-error-slot"]',
            ),
          ).toBeInTheDocument();
        });
        expect(screen.queryByText(toastSavedToMy(routineName))).not.toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: REMOVE_FROM_MY }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: SAVE_TO_MY_ROUTINES }),
        ).not.toBeInTheDocument();
        expect(getRoutineDetails.mock.calls.length).toBe(callsAfterSave);
        const repo = new PractitionerRoutinesRepository(fixture.storage);
        expect(
          await repo.findForPractitioner(fixture.practitionerId, fixture.routineId),
        ).not.toBeNull();
      } finally {
        restoreStaleDelete();
      }
    } finally {
      fixture.storage.close();
    }
  });

  it("keep → Undo with HTTP 401 dismisses toast and leaves kept personal copy", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("undo-keep-401");
    try {
      const details = await fixture.client.getRoutineDetails(fixture.routineId);
      const keptVersion = details.my_copy!.source_version_number;
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        fixture.storage,
        fixture.practitionerId,
        "a@example.com",
      );
      const client = createClientWithUndo401(deps, cookie);
      const getRoutineDetails = vi.spyOn(client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(fixture.routineId, client);
      await waitFor(() => {
        expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: KEEP_MINE }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: TOAST_UNDO })).toBeInTheDocument();
      });
      expect(screen.getByText(toastKeptCopy(keptVersion))).toBeInTheDocument();
      const callsAfterKeep = getRoutineDetails.mock.calls.length;
      await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
      await waitFor(() => {
        expect(
          document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
        ).toBeInTheDocument();
      });
      expect(screen.queryByText(toastKeptCopy(keptVersion))).not.toBeInTheDocument();
      expect(getRoutineDetails.mock.calls.length).toBe(callsAfterKeep);
      const after = await client.getRoutineDetails(fixture.routineId);
      expect(after.my_copy?.source_version_number).toBe(keptVersion);
      expect(after.personal_changes).not.toBeNull();
      expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
    } finally {
      fixture.storage.close();
    }
  });

  it("remove → Undo with HTTP 409 keeps removed state, dismisses success toast, shows error slot", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("undo-remove-409");
    try {
      const wrong = await seedPractitioner(
        fixture.storage,
        id("ui-undo-remove-wrong"),
        "undo-remove-wrong@example.com",
      );
      const loaded = await fixture.client.getRoutineDetails(fixture.routineId);
      if (loaded.is_draft) {
        throw new Error("expected published routine");
      }
      const routineName = loaded.community.name;
      const getRoutineDetails = vi.spyOn(fixture.client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(fixture.routineId, fixture.client);
      await waitFor(() => {
        expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
      });
      const callsAfterInitialLoad = getRoutineDetails.mock.calls.length;
      await user.click(screen.getByRole("button", { name: REMOVE_FROM_MY }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: TOAST_UNDO })).toBeInTheDocument();
      });
      expect(screen.getByText(toastRemovedFromMy(routineName))).toBeInTheDocument();
      const callsAfterRemove = getRoutineDetails.mock.calls.length;
      expect(callsAfterRemove).toBeGreaterThan(callsAfterInitialLoad);
      const restore = installRealStaleRestoreSavedCopyFixture(wrong);
      try {
        await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
        await waitFor(() => {
          expect(
            document.querySelector(
              '[data-testid="routine-detail-mutation-error-slot"]',
            ),
          ).toBeInTheDocument();
        });
        expect(
          screen.queryByText(toastRemovedFromMy(routineName)),
        ).not.toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: SAVE_TO_MY_ROUTINES }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: REMOVE_FROM_MY }),
        ).not.toBeInTheDocument();
        expect(getRoutineDetails.mock.calls.length).toBe(callsAfterRemove);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
          routineName,
        );
        const after = await fixture.client.getRoutineDetails(fixture.routineId);
        expect(after.my_copy).toBeNull();
      } finally {
        restore();
      }
    } finally {
      fixture.storage.close();
    }
  });

  it("remove → Undo with HTTP 401 dismisses toast and leaves post-remove state", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("undo-remove-401");
    try {
      const { deps, cookie } = appDepsForRoutinesHttpUi(
        fixture.storage,
        fixture.practitionerId,
        "a@example.com",
      );
      const client = createClientWithUndo401(deps, cookie);
      const loadedForRemove = await client.getRoutineDetails(fixture.routineId);
      if (loadedForRemove.is_draft) {
        throw new Error("expected published routine");
      }
      const routineName = loadedForRemove.community.name;
      const getRoutineDetails = vi.spyOn(client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(fixture.routineId, client);
      await waitFor(() => {
        expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
      });
      const callsAfterInitialLoad = getRoutineDetails.mock.calls.length;
      await user.click(screen.getByRole("button", { name: REMOVE_FROM_MY }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: TOAST_UNDO })).toBeInTheDocument();
      });
      const callsAfterRemove = getRoutineDetails.mock.calls.length;
      expect(callsAfterRemove).toBeGreaterThan(callsAfterInitialLoad);
      await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
      await waitFor(() => {
        expect(
          document.querySelector('[data-testid="routine-detail-mutation-error-slot"]'),
        ).toBeInTheDocument();
      });
      expect(
        screen.queryByText(toastRemovedFromMy(routineName)),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: SAVE_TO_MY_ROUTINES }),
      ).toBeInTheDocument();
      expect(getRoutineDetails.mock.calls.length).toBe(callsAfterRemove);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(routineName);
      const after = await client.getRoutineDetails(fixture.routineId);
      expect(after.my_copy).toBeNull();
    } finally {
      fixture.storage.close();
    }
  });

  it("adopt → Undo with HTTP 409 uses the same applyUndo failure surface", async () => {
    const fixture = await openFlaggedRoutineHttpUiFixture("undo-adopt-409");
    try {
      const details = await fixture.client.getRoutineDetails(fixture.routineId);
      if (details.is_draft) {
        throw new Error("expected published routine");
      }
      const version = details.community.version_number;
      const adoptedName = details.community.name;
      const wrong = await seedPractitioner(
        fixture.storage,
        id("ui-undo-adopt-wrong"),
        "undo-adopt-wrong@example.com",
      );
      const getRoutineDetails = vi.spyOn(fixture.client, "getRoutineDetails");
      const user = userEvent.setup();
      renderDetail(fixture.routineId, fixture.client);
      await waitFor(() => {
        expect(screen.getByTestId("routine-update-banner")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: useVersionN(version) }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: TOAST_UNDO })).toBeInTheDocument();
      });
      expect(screen.getByText(toastAdoptedVersion(version))).toBeInTheDocument();
      const callsAfterAdopt = getRoutineDetails.mock.calls.length;
      const restore = installRealStaleRestoreSavedCopyFixture(wrong);
      try {
        await user.click(screen.getByRole("button", { name: TOAST_UNDO }));
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
        expect(getRoutineDetails.mock.calls.length).toBe(callsAfterAdopt);
        expect(screen.queryByTestId("routine-update-banner")).not.toBeInTheDocument();
        const after = await fixture.client.getRoutineDetails(fixture.routineId);
        if (after.is_draft) {
          throw new Error("expected published routine");
        }
        expect(after.my_copy?.source_version_number).toBe(version);
        expect(after.community.name).toBe(adoptedName);
        expect(after.my_copy?.edited).toBe(false);
      } finally {
        restore();
      }
    } finally {
      fixture.storage.close();
    }
  });
});
