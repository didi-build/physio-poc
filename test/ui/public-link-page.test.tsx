/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLinkPage } from "../../src/ui/pages/PublicLinkPage.js";
import {
  PUBLIC_LINK_CLOSED_HEADING,
  PUBLIC_LINK_EXERCISE_PROGRAM_LABEL,
  PUBLIC_LINK_PAGE_INTRO,
  PUBLIC_LINK_PRINT,
  PUBLIC_LINK_SAVE_AS_PDF,
} from "../../src/copy/programs-share.js";
import { TYPE_LABELS } from "../../src/ui/copy/my-defaults.js";
const PRINT_STYLESHEET = join(process.cwd(), "src/ui/styles/public-link-page.css");

function renderOpenLink(
  rows: Array<{
    position: number;
    title: string;
    prescription_type: "stretching" | "eccentric";
    params: Record<string, number>;
    note: string | null;
    media?: { start_url: string; end_url: string } | null;
  }>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        availability: "open",
        program_name: "Week one",
        published_at: "2026-04-01T00:00:00.000Z",
        expiry_line: "This link stays open until your physiotherapist closes it.",
        rows,
      }),
    }),
  );
  render(
    <MemoryRouter initialEntries={["/l/demo-token"]}>
      <Routes>
        <Route path="/l/:code" element={<PublicLinkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PublicLinkPage (UI)", () => {
  it("renders the open link view from the public API", async () => {
    renderOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: null,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Week one" })).toBeInTheDocument();
    });
    expect(screen.getByText(PUBLIC_LINK_EXERCISE_PROGRAM_LABEL)).toBeInTheDocument();
    expect(screen.getByText(PUBLIC_LINK_PAGE_INTRO)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: PUBLIC_LINK_SAVE_AS_PDF }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PUBLIC_LINK_PRINT })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: `Heel slide, ${TYPE_LABELS.stretching.toLowerCase()}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("30s hold");
    expect(
      screen.getByText("This link stays open until your physiotherapist closes it."),
    ).toBeInTheDocument();
  });

  it("renders every published row and includes print-layout hooks", async () => {
    renderOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: "Slow and controlled",
        media: null,
      },
      {
        position: 1,
        title: "Bridge",
        prescription_type: "eccentric",
        params: { reps: 12, sets: 3 },
        note: null,
        media: null,
      },
    ]);
    await waitFor(() => {
      expect(screen.getByText("Slow and controlled")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(document.querySelectorAll(".link-page-row")).toHaveLength(2);
    expect(document.querySelector(".link-page-actions")).toHaveClass(
      "link-page-no-print",
    );
    expect(document.querySelector(".link-page-print-document")).toBeTruthy();
  });

  it("shows the prescription type on non-stretching rows", async () => {
    renderOpenLink([
      {
        position: 0,
        title: "Bridge",
        prescription_type: "eccentric",
        params: { reps: 10 },
        note: null,
        media: null,
      },
    ]);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          level: 2,
          name: `Bridge, ${TYPE_LABELS.eccentric.toLowerCase()}`,
        }),
      ).toBeInTheDocument();
    });
  });

  it("calls window.print from Save as PDF and Print", async () => {
    const printMock = vi.fn();
    vi.stubGlobal("print", printMock);
    renderOpenLink([
      {
        position: 0,
        title: "Heel slide",
        prescription_type: "stretching",
        params: { hold_s: 30 },
        note: null,
        media: null,
      },
    ]);
    const user = userEvent.setup();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: PUBLIC_LINK_SAVE_AS_PDF }),
      ).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: PUBLIC_LINK_SAVE_AS_PDF }));
    await user.click(screen.getByRole("button", { name: PUBLIC_LINK_PRINT }));
    expect(printMock).toHaveBeenCalledTimes(2);
  });

  it("omits the dose line when exercise params are empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          availability: "open",
          program_name: "Week one",
          published_at: "2026-04-01T00:00:00.000Z",
          expiry_line: "This link stays open until your physiotherapist closes it.",
          rows: [
            {
              position: 0,
              title: "Heel slide",
              prescription_type: "stretching",
              params: {},
              note: null,
              media: null,
            },
          ],
        }),
      }),
    );
    render(
      <MemoryRouter initialEntries={["/l/demo-token"]}>
        <Routes>
          <Route path="/l/:code" element={<PublicLinkPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Week one" })).toBeInTheDocument();
    });
    const listItem = screen.getByRole("listitem");
    expect(listItem.querySelectorAll(".link-page-dose-line")).toHaveLength(0);
  });

  it("renders the closed state without extra program details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          availability: "unavailable",
          heading: PUBLIC_LINK_CLOSED_HEADING,
        }),
      }),
    );
    render(
      <MemoryRouter initialEntries={["/l/closed-token"]}>
        <Routes>
          <Route path="/l/:code" element={<PublicLinkPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: PUBLIC_LINK_CLOSED_HEADING }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Week one")).toBeNull();
  });
});

describe("public link page print stylesheet", () => {
  it("hides chrome and keeps row blocks printable", () => {
    const css = readFileSync(PRINT_STYLESHEET, "utf8");
    expect(css).toContain("@media print");
    expect(css).toMatch(/\.link-page-no-print\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.link-page-row\s*\{[^}]*break-inside:\s*avoid/);
    expect(css).not.toContain("exercise-motion");
  });
});
