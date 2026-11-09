/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicLinkPage } from "../../src/ui/pages/PublicLinkPage.js";
import {
  PUBLIC_LINK_CLOSED_HEADING,
  PUBLIC_LINK_PAGE_INTRO,
  PUBLIC_LINK_SAVE_AS_PDF,
} from "../../src/copy/programs-share.js";
import { TYPE_LABELS } from "../../src/ui/copy/my-defaults.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PublicLinkPage (UI)", () => {
  it("renders the open link view from the public API", async () => {
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
              params: { hold_s: 30 },
              note: null,
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
    expect(screen.getByText(PUBLIC_LINK_PAGE_INTRO)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: PUBLIC_LINK_SAVE_AS_PDF }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: `Heel slide, ${TYPE_LABELS.stretching.toLowerCase()}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("30s hold")).toBeInTheDocument();
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
