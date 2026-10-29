/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";

afterEach(() => {
  cleanup();
});

function renderApp(requestsReviewCount = 2) {
  return render(
    <MemoryRouter initialEntries={["/exercises"]}>
      <PhysioApp requestsReviewCount={requestsReviewCount} />
    </MemoryRouter>,
  );
}

describe("app shell nav (integration)", () => {
  it("renders verbatim desktop and phone nav labels", () => {
    renderApp(0);

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
    expect(
      within(tabNav).getByRole("link", { name: /^Requests$/ }),
    ).toBeInTheDocument();
    expect(
      within(tabNav).queryByRole("link", { name: "Requests and drafts" }),
    ).not.toBeInTheDocument();
  });

  it("shows an amber requests count on desktop and phone nav", () => {
    const { container } = renderApp(4);
    expect(container.querySelectorAll(".shell-count-badge")).toHaveLength(1);
    expect(container.querySelectorAll(".shell-tab-count")).toHaveLength(1);
  });

  it("opens the account menu with verbatim copy and a sign-out link", async () => {
    const user = userEvent.setup();
    renderApp(0);

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByText("Signed in as Kojo, physiotherapist")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /My defaults/ })).toHaveTextContent(
      "Types, links",
    );
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOut.tagName).toBe("A");
  });

  it("does not render global search", () => {
    renderApp(0);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });
});
