/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";

afterEach(() => {
  cleanup();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderApp(initialEntry: string, requestsReviewCount = 0) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhysioApp requestsReviewCount={requestsReviewCount} />
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

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(defaultsItem);

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(signOutItem);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
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

  it("does not render global search", () => {
    renderApp("/exercises", 0);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });
});
