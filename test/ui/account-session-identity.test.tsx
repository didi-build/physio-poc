/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  FAKE_UI_ACCOUNT_SIGNED_IN_LINE,
  FAKE_UI_ACCOUNT_SIGNED_IN_LINE_B,
  FAKE_UI_DISPLAY_NAME,
  FAKE_UI_DISPLAY_NAME_B,
  fakeUiSessionView,
  stubPractitionerSessionClient,
} from "./fake-practitioner-session-fixture.js";
import { PractitionerSessionClient } from "../../src/ui/api/practitioner-session-client.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
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

function renderWithSession(sessionClient = stubPractitionerSessionClient()) {
  return render(
    <MemoryRouter initialEntries={["/exercises"]}>
      <PhysioApp
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient()}
        practitionerSessionClient={sessionClient}
      />
    </MemoryRouter>,
  );
}

describe("account chip and menu session identity (DIDI-1172)", () => {
  it("shows the session display name in the chip, not a hard-coded Kojo placeholder", async () => {
    renderWithSession();
    await waitFor(() => {
      expect(screen.getByText(FAKE_UI_DISPLAY_NAME)).toBeInTheDocument();
    });
    expect(screen.queryByText("Kojo")).not.toBeInTheDocument();
  });

  it("shows distinct identities for distinct stub sessions", async () => {
    const { unmount } = renderWithSession(
      stubPractitionerSessionClient(
        fakeUiSessionView({ display_name: FAKE_UI_DISPLAY_NAME }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByText(FAKE_UI_DISPLAY_NAME)).toBeInTheDocument();
    });
    unmount();
    cleanup();

    renderWithSession(
      stubPractitionerSessionClient(
        fakeUiSessionView({ display_name: FAKE_UI_DISPLAY_NAME_B }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByText(FAKE_UI_DISPLAY_NAME_B)).toBeInTheDocument();
    });
    expect(screen.queryByText(FAKE_UI_DISPLAY_NAME)).not.toBeInTheDocument();
  });

  it("shows the signed-in line from the session in the account menu", async () => {
    const user = userEvent.setup();
    renderWithSession();
    await waitFor(() => {
      expect(screen.getByText(FAKE_UI_DISPLAY_NAME)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText(FAKE_UI_ACCOUNT_SIGNED_IN_LINE)).toBeInTheDocument();
    expect(screen.queryByText(/Kojo/)).not.toBeInTheDocument();
  });

  it("shows session B signed-in line when session B is active", async () => {
    const user = userEvent.setup();
    renderWithSession(
      stubPractitionerSessionClient(
        fakeUiSessionView({ display_name: FAKE_UI_DISPLAY_NAME_B }),
      ),
    );
    await waitFor(() => {
      expect(screen.getByText(FAKE_UI_DISPLAY_NAME_B)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText(FAKE_UI_ACCOUNT_SIGNED_IN_LINE_B)).toBeInTheDocument();
  });

  it("does not keep Kojo in account shell source", () => {
    const repoRoot = join(import.meta.dirname, "../..");
    const shellNav = readFileSync(join(repoRoot, "src/ui/layout/ShellNav.tsx"), "utf8");
    const navCopy = readFileSync(join(repoRoot, "src/ui/copy/nav.ts"), "utf8");
    const a11yCopy = readFileSync(join(repoRoot, "src/ui/copy/a11y.ts"), "utf8");
    expect(shellNav).not.toMatch(/Kojo/);
    expect(navCopy).not.toMatch(/Kojo/);
    expect(a11yCopy).not.toMatch(/Kojo/);
  });

  it("shows no account name and never Kojo while session is loading", () => {
    const pendingClient = {
      getSession: vi.fn(() => new Promise(() => {})),
    } as unknown as PractitionerSessionClient;
    renderWithSession(pendingClient);
    expect(screen.queryByText("Kojo")).not.toBeInTheDocument();
    expect(screen.queryByText(FAKE_UI_DISPLAY_NAME)).not.toBeInTheDocument();
    expect(screen.getByTestId("shell-account-avatar")).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("shows no account name and never Kojo when getSession rejects", async () => {
    const failingClient = {
      getSession: vi.fn().mockRejectedValue(new Error("session unavailable")),
    } as unknown as PractitionerSessionClient;
    renderWithSession(failingClient);
    await waitFor(() => {
      expect(screen.getByTestId("shell-account-avatar")).toHaveTextContent("");
    });
    expect(screen.queryByText("Kojo")).not.toBeInTheDocument();
    expect(screen.queryByText(FAKE_UI_DISPLAY_NAME)).not.toBeInTheDocument();
  });
});
