/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { ensureMatchMediaStub, mockMinWidth1024 } from "./setup.js";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import * as authClient from "../../src/ui/api/auth-client.js";
import { ARIA_CLOSE_MENU } from "../../src/ui/copy/a11y.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  ExerciseRequestsClient,
  setExerciseRequestsClientForTests,
} from "../../src/ui/api/exercise-requests-client.js";
import {
  RoutinesClient,
  setRoutinesClientForTests,
} from "../../src/ui/api/routines-client.js";
import { SEARCH_ROUTINES_LABEL } from "../../src/ui/copy/routines.js";
import {
  FAKE_UI_ACCOUNT_SIGNED_IN_LINE,
  FAKE_UI_DISPLAY_NAME,
  stubPractitionerSessionClient,
} from "./fake-practitioner-session-fixture.js";
import {
  SHELL_TAB_ICON_PATH_EXERCISES,
  SHELL_TAB_ICON_PATH_PROGRAMS,
  SHELL_TAB_ICON_PATH_REQUESTS,
  SHELL_TAB_ICON_PATH_ROUTINES,
} from "../../src/ui/layout/shell-tab-icons.js";
import { SEARCH_PROGRAMS_LABEL } from "../../src/ui/copy/programs.js";
import {
  NAV_TAB_REQUESTS_DESKTOP,
  NAV_TAB_REQUESTS_PHONE,
} from "../../src/ui/copy/nav.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setExerciseRequestsClientForTests(null);
  setRoutinesClientForTests(null);
  vi.restoreAllMocks();
  ensureMatchMediaStub();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

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

function stubRoutinesClient(): RoutinesClient {
  return {
    searchCommunity: vi.fn().mockResolvedValue({
      routines: [],
      next_cursor: null,
      search_link: null,
      total_count: 0,
      conditions_available: false,
      condition_options: [],
    }),
    listMyRoutines: vi.fn().mockResolvedValue({
      drafts: [],
      saved: [],
      flagged_count: 0,
      conditions_available: false,
      condition_options: [],
    }),
  } as unknown as RoutinesClient;
}

function stubProgramsClient(): ProgramsClient {
  return {
    listPrograms: vi.fn().mockResolvedValue({ items: [], matched_code: null }),
    listDeletedPrograms: vi.fn().mockResolvedValue({ items: [] }),
    createProgram: vi.fn(),
    getProgram: vi.fn(),
    getProgramByCode: vi.fn(),
    updateProgramName: vi.fn(),
    deleteProgram: vi.fn(),
    restoreProgram: vi.fn(),
    addExerciseRow: vi.fn(),
    addPlaceholderRow: vi.fn(),
    updateRow: vi.fn(),
    deleteRow: vi.fn(),
    reorderRows: vi.fn(),
    duplicateRow: vi.fn(),
    applyLibraryUpdate: vi.fn(),
    keepLibraryUpdate: vi.fn(),
  } as unknown as ProgramsClient;
}

function stubRequestsClient(inProgressCount = 0): ExerciseRequestsClient {
  return {
    getInProgressCount: vi
      .fn()
      .mockResolvedValue({ in_progress_count: inProgressCount }),
  } as unknown as ExerciseRequestsClient;
}

function renderApp(
  initialEntry: string,
  requestsReviewCount = 0,
  sessionClient = stubPractitionerSessionClient(),
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp
        requestsReviewCount={requestsReviewCount}
        exerciseLibraryClient={stubLibraryClient()}
        exerciseRequestsClient={stubRequestsClient(requestsReviewCount)}
        programsClient={stubProgramsClient()}
        routinesClient={stubRoutinesClient()}
        practitionerSessionClient={sessionClient}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function safariActivateMenuItem(item: HTMLElement) {
  let itemReceivedFocus = false;
  const onItemFocus = () => {
    itemReceivedFocus = true;
  };
  item.addEventListener("focus", onItemFocus);
  try {
    const focusedBefore = document.activeElement;
    await act(async () => {
      fireEvent.pointerDown(item);
      fireEvent.mouseDown(item);
      if (focusedBefore instanceof HTMLElement) {
        focusedBefore.blur();
        fireEvent.focusOut(focusedBefore, { relatedTarget: null });
      }
      expect(document.activeElement).toBe(document.body);
    });
    await act(async () => {
      await Promise.resolve();
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });
    await act(async () => {
      await delay(20);
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.click(item);
    });
    expect(itemReceivedFocus).toBe(false);
  } finally {
    item.removeEventListener("focus", onItemFocus);
  }
}

describe("app shell nav (integration)", () => {
  it("redirects / to /exercises", async () => {
    renderApp("/");
    expect(screen.getByTestId("location")).toHaveTextContent("/exercises");
  });

  it("renders verbatim desktop and phone nav labels (three primary tabs only)", () => {
    renderApp("/exercises", 0);

    const navs = screen.getAllByRole("navigation", { name: "Main" });
    expect(navs).toHaveLength(2);

    const topNav = navs[0];
    expect(within(topNav).getByRole("link", { name: "Exercises" })).toBeInTheDocument();
    expect(within(topNav).getByRole("link", { name: "Routines" })).toBeInTheDocument();
    expect(within(topNav).getByRole("link", { name: "Programs" })).toBeInTheDocument();
    expect(
      within(topNav).queryByRole("link", { name: NAV_TAB_REQUESTS_DESKTOP }),
    ).not.toBeInTheDocument();

    const tabNav = navs[1];
    expect(within(tabNav).getAllByRole("link")).toHaveLength(3);
    expect(
      within(tabNav).queryByRole("link", { name: NAV_TAB_REQUESTS_PHONE }),
    ).not.toBeInTheDocument();
  });

  it("labels the account menu Requests row per breakpoint copy", async () => {
    const user = userEvent.setup();
    const wide = mockMinWidth1024(true);
    try {
      renderApp("/exercises", 0);
      await user.click(screen.getByRole("button", { name: "Account menu" }));
      expect(
        screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_DESKTOP }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE }),
      ).not.toBeInTheDocument();
    } finally {
      wide.setMatches(false);
    }

    cleanup();
    ensureMatchMediaStub();

    renderApp("/exercises", 0);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(
      screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE }),
    ).toBeInTheDocument();
  });

  it("puts Requests after the identity line and before My defaults", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    await waitFor(() => {
      expect(screen.getByText(FAKE_UI_DISPLAY_NAME)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAccessibleName(NAV_TAB_REQUESTS_PHONE);
    expect(items[1]).toHaveAccessibleName(/My defaults/);
    expect(items[2]).toHaveAccessibleName("Sign out");
  });

  it("places the Requests row as the next DOM sibling after the signed-in identity block", async () => {
    const user = userEvent.setup();
    const { container } = renderApp("/exercises", 0);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const signedIn = container.querySelector(".shell-menu-signed-in");
    const requestsRow = screen.getByTestId("shell-menu-requests");
    expect(signedIn).toBeTruthy();
    expect(signedIn?.nextElementSibling).toBe(requestsRow);
  });

  it("keeps the inbox icon path on the account menu Requests row", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const row = screen.getByTestId("shell-menu-requests");
    const path = row.querySelector("svg.shell-menu-inbox-icon path");
    expect(path).toHaveAttribute("d", SHELL_TAB_ICON_PATH_REQUESTS);
  });

  it("renders an approved mock icon in each phone tab link", () => {
    renderApp("/exercises", 0);
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];
    const expected: { name: string; pathD: string }[] = [
      { name: "Exercises", pathD: SHELL_TAB_ICON_PATH_EXERCISES },
      { name: "Routines", pathD: SHELL_TAB_ICON_PATH_ROUTINES },
      { name: "Programs", pathD: SHELL_TAB_ICON_PATH_PROGRAMS },
    ];

    for (const tab of expected) {
      const link = within(tabNav).getByRole("link", { name: tab.name });
      const wrap = link.querySelector(".shell-tab-icon-wrap");
      expect(wrap).toBeTruthy();
      expect(wrap).toHaveAttribute("aria-hidden", "true");
      const path = wrap?.querySelector("svg.shell-tab-icon path");
      expect(path).toBeTruthy();
      expect(path).toHaveAttribute("d", tab.pathD);
    }
  });

  it("maps each phone tab to its own icon path", () => {
    renderApp("/exercises", 0);
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];
    const exercisesPath = within(tabNav)
      .getByRole("link", { name: "Exercises" })
      .querySelector("svg.shell-tab-icon path")
      ?.getAttribute("d");
    const routinesPath = within(tabNav)
      .getByRole("link", { name: "Routines" })
      .querySelector("svg.shell-tab-icon path")
      ?.getAttribute("d");
    expect(exercisesPath).toBe(SHELL_TAB_ICON_PATH_EXERCISES);
    expect(routinesPath).toBe(SHELL_TAB_ICON_PATH_ROUTINES);
    expect(exercisesPath).not.toBe(routinesPath);
  });

  it("uses heavier stroke on the active phone tab icon", () => {
    renderApp("/programs", 0);
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];
    const activeIcon = within(tabNav)
      .getByRole("link", { name: "Programs" })
      .querySelector("svg.shell-tab-icon");
    const inactiveIcon = within(tabNav)
      .getByRole("link", { name: "Exercises" })
      .querySelector("svg.shell-tab-icon");
    expect(activeIcon).toHaveAttribute("stroke-width", "2.1");
    expect(inactiveIcon).toHaveAttribute("stroke-width", "1.8");
  });

  it("shows no requests drafts count in the account menu when the count is 0", async () => {
    const user = userEvent.setup();
    const { container } = renderApp("/exercises", 0);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(container.querySelector(".shell-menu-requests-count")).toBeNull();
  });

  it("shows drafts count badges as exact bare integer strings", async () => {
    const user = userEvent.setup();

    renderApp("/exercises", 4);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await waitFor(() => {
      const row = screen.getByTestId("shell-menu-requests");
      const badge = row.querySelector(".shell-menu-requests-count");
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe("4");
    });
    cleanup();
    ensureMatchMediaStub();

    renderApp("/exercises", 12);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await waitFor(() => {
      const row = screen.getByTestId("shell-menu-requests");
      const badge = row.querySelector(".shell-menu-requests-count");
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe("12");
    });
  });

  it("sets aria-current on the active desktop top nav link", () => {
    renderApp("/programs", 0);
    const topNav = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(topNav).getByRole("link", { name: "Programs" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("sets aria-current on the active phone tab", () => {
    renderApp("/routines", 0);
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];
    expect(within(tabNav).getByRole("link", { name: "Routines" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark any primary nav tab as current when the route is requests", () => {
    renderApp("/requests", 0);
    const topNav = screen.getAllByRole("navigation", { name: "Main" })[0];
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];
    for (const link of within(topNav).getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).not.toBe("page");
    }
    for (const link of within(tabNav).getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).not.toBe("page");
    }
  });

  it("updates the Requests menu label after the viewport crosses the desktop breakpoint", async () => {
    const user = userEvent.setup();
    const mq = mockMinWidth1024(false);
    renderApp("/exercises", 0);
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(
      screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE }),
    ).toBeInTheDocument();

    await act(async () => {
      mq.setMatches(true);
    });
    expect(
      screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_DESKTOP }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE }),
    ).not.toBeInTheDocument();
  });

  it("navigates each tab to the correct route and reaches Requests from the account menu", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];

    await user.click(within(tabNav).getByRole("link", { name: "Programs" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/programs");

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE }));
    expect(screen.getByTestId("location")).toHaveTextContent("/requests");
  });

  it("toggles aria-expanded on the account menu", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("moves focus into the menu and supports arrow keys and Escape", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    const requestsItem = screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE });
    const defaultsItem = screen.getByRole("menuitem", { name: /My defaults/ });
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    expect(document.activeElement).toBe(requestsItem);

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(defaultsItem);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(signOutItem);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(requestsItem);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(signOutItem);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the account menu when focus leaves the menu panel", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    screen.getByRole("menuitem", { name: "Sign out" }).focus();
    await user.tab();

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when focus moves from the first item to the trigger, then closes when focus leaves the wrap", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    const requestsItem = screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE });
    expect(document.activeElement).toBe(requestsItem);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.focusOut(requestsItem, { relatedTarget: trigger });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    trigger.focus();
    await user.tab({ shift: true });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the account menu open when focusout has a null relatedTarget", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    signOutItem.focus();
    fireEvent.focusOut(signOutItem, { relatedTarget: null });

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("activates My defaults and Sign out on Safari pointer path without menu item focus", async () => {
    const user = userEvent.setup();
    const signOutSpy = vi
      .spyOn(authClient, "postAuthSignOut")
      .mockResolvedValue(new Response(null, { status: 200 }));
    renderApp("/exercises", 0);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const defaultsItem = screen.getByRole("menuitem", { name: /My defaults/ });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await safariActivateMenuItem(defaultsItem);
    expect(screen.getByTestId("location")).toHaveTextContent("/defaults");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await safariActivateMenuItem(signOutItem);
    await waitFor(() => {
      expect(signOutSpy).toHaveBeenCalled();
    });
  });

  it("closes the account menu on Escape when focus is on the trigger", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    trigger.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the account menu on Tab and Shift+Tab out of the wrap", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    const topNav = screen.getAllByRole("navigation", { name: "Main" })[0];
    const outsideLink = within(topNav).getByRole("link", { name: "Routines" });

    await user.click(trigger);
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    signOutItem.focus();
    await user.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    outsideLink.focus();
    await user.click(trigger);
    const requestsItem = screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE });
    expect(document.activeElement).toBe(requestsItem);
    await user.tab({ shift: true });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);

    await user.tab({ shift: true });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes after Tab keydown once focus moves (Chrome focus order)", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    const topNav = screen.getAllByRole("navigation", { name: "Main" })[0];
    const outsideLink = within(topNav).getByRole("link", { name: "Routines" });

    await user.click(trigger);
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    signOutItem.focus();
    fireEvent.keyDown(signOutItem, { key: "Tab", code: "Tab" });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.focusOut(signOutItem, { relatedTarget: outsideLink });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the account menu when the window loses focus", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.blur(window);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the account menu when the backdrop or an outside control is clicked", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    const topNav = screen.getAllByRole("navigation", { name: "Main" })[0];

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: ARIA_CLOSE_MENU }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(within(topNav).getByRole("link", { name: "Programs" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the account menu on outside pointerdown without moving focus", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];
    const tabLink = within(tabNav).getByRole("link", { name: "Routines" });

    await user.click(trigger);
    const requestsItem = screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE });
    expect(document.activeElement).toBe(requestsItem);

    fireEvent.pointerDown(tabLink);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).not.toBe(tabLink);
  });

  it("keeps the account menu open when arrow keys move focus between items", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("returns focus to the trigger after choosing My defaults", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: /My defaults/ }));

    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the trigger after choosing Requests", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByTestId("location")).toHaveTextContent("/requests");
  });

  it("activates Requests on Safari pointer path without menu item focus", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const requestsItem = screen.getByRole("menuitem", { name: NAV_TAB_REQUESTS_PHONE });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await safariActivateMenuItem(requestsItem);
    expect(screen.getByTestId("location")).toHaveTextContent("/requests");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu after choosing My defaults", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(screen.getByRole("menuitem", { name: /My defaults/ }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/defaults");
  });

  it("opens the account menu with verbatim copy and a sign-out link", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);

    await waitFor(() => {
      expect(screen.getByText(FAKE_UI_DISPLAY_NAME)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByText(FAKE_UI_ACCOUNT_SIGNED_IN_LINE)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /My defaults/ })).toHaveTextContent(
      "Types, links",
    );
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOut.tagName).toBe("BUTTON");
  });

  it.each(["/requests", "/defaults"] as const)(
    "does not render search UI anywhere on %s",
    (route) => {
      renderApp(route, 0);
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    },
  );

  it("renders page-level routine search on /routines without shell global search", () => {
    renderApp("/routines", 0);
    const header = document.querySelector(".shell-header");
    expect(header).toBeTruthy();
    expect(
      within(header as HTMLElement).queryByRole("searchbox"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(SEARCH_ROUTINES_LABEL)).toBeInTheDocument();
  });

  it("renders page-level program search on /programs without shell global search", () => {
    renderApp("/programs", 0);
    const header = document.querySelector(".shell-header");
    expect(header).toBeTruthy();
    expect(
      within(header as HTMLElement).queryByRole("searchbox"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: SEARCH_PROGRAMS_LABEL }),
    ).toBeInTheDocument();
  });

  it("does not render global search in the app shell header on library routes", () => {
    renderApp("/exercises", 0);
    const header = document.querySelector(".shell-header");
    expect(header).toBeTruthy();
    expect(
      within(header as HTMLElement).queryByRole("searchbox"),
    ).not.toBeInTheDocument();
  });

  it("renders page-level exercise search on the library route", () => {
    renderApp("/exercises", 0);
    expect(
      screen.getByRole("searchbox", { name: "Search exercises" }),
    ).toBeInTheDocument();
  });

  it("renders routine detail without library search on direct entry", async () => {
    const routinesClient = {
      ...stubRoutinesClient(),
      getRoutineDetails: vi.fn().mockResolvedValue({
        routine_id: "rt-1",
        body_region_label: "Knee",
        condition_label: null,
        who_its_for: null,
        community: {
          routine_version_id: "rv-1",
          version_number: 1,
          name: "Knee starter",
          updated_at: "2026-10-25T12:00:00.000Z",
          created_by: "dev-practitioner",
          usage_count: 0,
          rows: [],
        },
        my_copy: null,
        sent_program_count: 0,
        sent_program_codes: [],
        conditions_available: false,
        personal_changes: null,
        community_change_list: null,
      }),
    } as unknown as RoutinesClient;
    setRoutinesClientForTests(routinesClient);
    render(
      <MemoryRouter initialEntries={["/routines/rt-1"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={routinesClient}
          practitionerSessionClient={stubPractitionerSessionClient()}
        />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText("Knee starter")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(SEARCH_ROUTINES_LABEL)).not.toBeInTheDocument();
  });

  it("renders routine my-copy editor on direct entry", async () => {
    const routinesClient = {
      ...stubRoutinesClient(),
      getRoutineDetails: vi.fn().mockResolvedValue({
        routine_id: "rt-1",
        body_region_label: "Knee",
        condition_label: null,
        who_its_for: null,
        community: {
          routine_version_id: "rv-1",
          version_number: 1,
          name: "Knee starter",
          updated_at: "2026-10-25T12:00:00.000Z",
          created_by: "dev-practitioner",
          usage_count: 0,
          rows: [
            {
              position: 0,
              exercise_id: "ex-1",
              exercise_version_id: "ver-1",
              exercise_name: "Heel slide",
              prescription_type: "stretching",
              params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        },
        my_copy: {
          practitioner_routine_id: "pr-1",
          source_version_number: 1,
          edited: false,
          community_updated: false,
          rows: [
            {
              position: 0,
              exercise_id: "ex-1",
              exercise_version_id: "ver-1",
              exercise_name: "Heel slide",
              prescription_type: "stretching",
              params: { hold_s: 30, per_day: { min: 1, max: 2 }, days_per_week: 7 },
            },
          ],
        },
        sent_program_count: 0,
        sent_program_codes: [],
        conditions_available: false,
        personal_changes: {
          baseline_available: true,
          change_count: 0,
          your_change_positions: [],
        },
        community_change_list: null,
      }),
    } as unknown as RoutinesClient;
    setRoutinesClientForTests(routinesClient);
    render(
      <MemoryRouter initialEntries={["/routines/rt-1/my-copy"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          exerciseRequestsClient={stubRequestsClient()}
          programsClient={stubProgramsClient()}
          routinesClient={routinesClient}
          practitionerSessionClient={stubPractitionerSessionClient()}
        />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Save my copy" }),
    ).toBeInTheDocument();
  });
});
