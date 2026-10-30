/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  vi.restoreAllMocks();
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

function renderApp(initialEntry: string, requestsReviewCount = 0) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp
        requestsReviewCount={requestsReviewCount}
        exerciseLibraryClient={stubLibraryClient()}
      />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("app shell nav (integration)", () => {
  it("redirects / to /exercises", async () => {
    renderApp("/");
    expect(screen.getByTestId("location")).toHaveTextContent("/exercises");
  });

  it("renders verbatim desktop and phone nav labels", () => {
    renderApp("/exercises", 0);

    const navs = screen.getAllByRole("navigation", { name: "Main" });
    expect(navs).toHaveLength(2);

    const topNav = navs[0];
    expect(within(topNav).getByRole("link", { name: "Exercises" })).toBeInTheDocument();
    expect(within(topNav).getByRole("link", { name: "Routines" })).toBeInTheDocument();
    expect(within(topNav).getByRole("link", { name: "Programs" })).toBeInTheDocument();
    expect(
      within(topNav).getByRole("link", { name: /Requests and drafts/ }),
    ).toBeInTheDocument();

    const tabNav = navs[1];
    expect(within(tabNav).getByRole("link", { name: "Requests" })).toBeInTheDocument();
  });

  it("shows no requests badge when the count is 0", () => {
    const { container } = renderApp("/exercises", 0);
    expect(container.querySelector(".shell-count-badge")).toBeNull();
    expect(container.querySelector(".shell-tab-count")).toBeNull();
  });

  it("shows an amber requests count when the count is greater than 0", () => {
    const { container } = renderApp("/exercises", 4);
    expect(container.querySelectorAll(".shell-count-badge")).toHaveLength(1);
    expect(container.querySelectorAll(".shell-tab-count")).toHaveLength(1);
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

  it("navigates each tab to the correct route", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const tabNav = screen.getAllByRole("navigation", { name: "Main" })[1];

    await user.click(within(tabNav).getByRole("link", { name: "Programs" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/programs");

    await user.click(within(tabNav).getByRole("link", { name: "Requests" }));
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
    const defaultsItem = screen.getByRole("menuitem", { name: /My defaults/ });
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    expect(document.activeElement).toBe(defaultsItem);

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(signOutItem);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(defaultsItem);
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
    const topNav = screen.getAllByRole("navigation", { name: "Main" })[0];
    const outsideTarget = within(topNav).getByRole("link", { name: "Exercises" });

    await user.click(trigger);
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    signOutItem.focus();
    fireEvent.focusOut(signOutItem, { relatedTarget: outsideTarget });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("stays open when focus moves from the first item to the trigger, then closes when focus leaves the wrap", async () => {
    const user = userEvent.setup();
    renderApp("/exercises", 0);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    const topNav = screen.getAllByRole("navigation", { name: "Main" })[0];
    const outsideTarget = within(topNav).getByRole("link", { name: "Exercises" });

    await user.click(trigger);
    const defaultsItem = screen.getByRole("menuitem", { name: /My defaults/ });
    expect(document.activeElement).toBe(defaultsItem);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.focusOut(defaultsItem, { relatedTarget: trigger });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    trigger.focus();
    fireEvent.focusOut(trigger, { relatedTarget: outsideTarget });
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

  it("activates menu items on pointer click when focusout has null relatedTarget (Safari path)", async () => {
    const user = userEvent.setup();
    const signOutSpy = vi
      .spyOn(authClient, "postAuthSignOut")
      .mockResolvedValue(new Response(null, { status: 200 }));
    renderApp("/exercises", 0);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const defaultsItem = screen.getByRole("menuitem", { name: /My defaults/ });
    fireEvent.focusOut(defaultsItem, { relatedTarget: null });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(defaultsItem);
    fireEvent.click(defaultsItem);
    expect(screen.getByTestId("location")).toHaveTextContent("/defaults");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const signOutItem = screen.getByRole("menuitem", { name: "Sign out" });
    fireEvent.focusOut(signOutItem, { relatedTarget: null });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(signOutItem);
    fireEvent.click(signOutItem);
    await waitFor(() => {
      expect(signOutSpy).toHaveBeenCalled();
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("pins account menu focus-out wiring in ShellNav (structural)", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../../src/ui/layout/ShellNav.tsx"),
      "utf8",
    );
    expect(source).toContain('wrap.addEventListener("focusout", onFocusOut)');
    expect(source).toContain("related === null");
    expect(source).toContain("menu.contains(related)");
    expect(source).toContain("wrap.contains(related)");
    expect(source).not.toContain("menu.contains(event.target as Node)");
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

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByText("Signed in as Kojo, physiotherapist")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /My defaults/ })).toHaveTextContent(
      "Types, links",
    );
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOut.tagName).toBe("BUTTON");
  });

  it.each(["/programs", "/routines", "/requests", "/defaults"] as const)(
    "does not render search UI anywhere on %s",
    (route) => {
      renderApp(route, 0);
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    },
  );

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
});
