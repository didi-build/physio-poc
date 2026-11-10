/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const useMinWidth1024Mock = vi.hoisted(() => vi.fn(() => true));

vi.mock("../../src/ui/hooks/useMinWidth1024.js", () => ({
  useMinWidth1024: () => useMinWidth1024Mock(),
}));
import {
  CLOSE_LINK_CONFIRM,
  CLOSE_LINK_SHEET_TITLE,
  LINK_EXPIRES_HEADING,
  PUBLISH_COPY_LINK,
  SHARE_HELPER_PUBLISHED,
  SHARE_HELPER_VIEW,
  SHARE_LINK_CLOSED_LINE,
  SHARE_SEE_LINK_PAGE,
  PHONE_SHARE,
} from "../../src/ui/copy/program-publish.js";
import type { ProgramShareConnectorView } from "../../src/services/programs/program-publish-service.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import { ProgramsApiProvider } from "../../src/ui/api/programs-context.js";
import type { ProgramsClient } from "../../src/ui/api/programs-client.js";
import { PractitionerSessionProvider } from "../../src/ui/api/practitioner-session-context.js";
import { ToastProvider } from "../../src/ui/components/Toast.js";
import { ProgramSharePage } from "../../src/ui/programs/ProgramSharePage.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";
import { setPractitionerSessionClientForTests } from "../../src/ui/api/practitioner-session-client.js";

afterEach(() => {
  cleanup();
  setPractitionerSessionClientForTests(null);
  useMinWidth1024Mock.mockReset();
  useMinWidth1024Mock.mockReturnValue(true);
});

const program: ProgramBuilderView = {
  program_id: "p-share",
  code: "PRG-SHR",
  name: "Share test",
  created_at: "2026-10-24T12:00:00.000Z",
  draft_updated_at: "2026-10-24T12:00:00.000Z",
  auto_save_status: {
    kind: "published",
    published_at: "2026-10-20T12:00:00.000Z",
  },
  draft_saved_at: "2026-10-24T12:00:00.000Z",
  exercise_count: 1,
  library_updates_to_review: 0,
  rows: [],
  open_share_link: true,
  share_link_status: "open",
  last_sent_at: "2026-10-24T12:00:00.000Z",
  deleted_at: null,
  routine_origin: null,
};

function openShareView(
  overrides: Partial<ProgramShareConnectorView> = {},
): ProgramShareConnectorView {
  return {
    display_state: "published_with_draft_changes",
    share_link: "https://physio.test.example/l/open-token",
    share_link_status: "open",
    share_link_state: "live",
    expires_at: "2027-10-24T12:00:00.000Z",
    open_share_link: true,
    draft: { version: 2, updated_at: "2026-10-24T12:00:00.000Z" },
    published: { version: 1, updated_at: "2026-10-20T12:00:00.000Z" },
    program_code: "PRG-SHR",
    program_name: "Share test",
    link_expires_in: "1_year",
    link_expires_on: null,
    practitioner_default_expires_in: "1_year",
    publish_change_lines: [],
    published_at: "2026-10-20T12:00:00.000Z",
    ...overrides,
  };
}

function renderShare(client: ProgramsClient, desktop = true) {
  useMinWidth1024Mock.mockReturnValue(desktop);
  setPractitionerSessionClientForTests(stubPractitionerSessionClient());
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      availability: "open",
      program_name: "Share test",
      published_at: "2026-10-20T12:00:00.000Z",
      rows: [],
    }),
  }) as typeof fetch;

  render(
    <MemoryRouter initialEntries={["/programs/PRG-SHR/share"]}>
      <PractitionerSessionProvider client={stubPractitionerSessionClient()}>
        <ProgramsApiProvider client={client}>
          <ToastProvider>
            <Routes>
              <Route
                path="/programs/:programCode/share"
                element={<ProgramSharePage />}
              />
            </Routes>
          </ToastProvider>
        </ProgramsApiProvider>
      </PractitionerSessionProvider>
    </MemoryRouter>,
  );
}

describe("Program share screen (DIDI-1014)", () => {
  it("shows share helpers in the desktop link card, not under the page title", async () => {
    const client = {
      getProgramByCode: vi.fn().mockResolvedValue(program),
      getShareLink: vi.fn().mockResolvedValue(openShareView()),
    } as unknown as ProgramsClient;
    renderShare(client, true);
    await screen.findByRole("button", { name: /Download PDF/ });
    const aside = document.querySelector(".pg-share-aside-slot .pg-share-aside");
    expect(aside).toBeTruthy();
    expect(
      within(aside as HTMLElement).getByText(SHARE_HELPER_VIEW),
    ).toBeInTheDocument();
    expect(
      within(aside as HTMLElement).getByText(SHARE_HELPER_PUBLISHED),
    ).toBeInTheDocument();
    const mainColumn = document.querySelector(".pg-share-main-column");
    expect(mainColumn?.querySelector(".pg-share-helper") ?? null).toBeNull();
  });

  it("keeps link helpers in the phone Share sheet, not on the main page", async () => {
    const client = {
      getProgramByCode: vi.fn().mockResolvedValue(program),
      getShareLink: vi.fn().mockResolvedValue(openShareView()),
    } as unknown as ProgramsClient;
    renderShare(client, false);
    await screen.findByRole("button", { name: PHONE_SHARE });
    const mainColumn = document.querySelector(".pg-share-main-column");
    expect(mainColumn?.querySelector(".pg-share-helper") ?? null).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: PHONE_SHARE }));
    const dialog = screen.getByRole("dialog", { name: "Share program" });
    expect(within(dialog).getByText(SHARE_HELPER_VIEW)).toBeInTheDocument();
    expect(within(dialog).getByText(SHARE_HELPER_PUBLISHED)).toBeInTheDocument();
  });

  it("hides url chrome but keeps expiry and close link for expired GET with empty share_link", async () => {
    const client = {
      getProgramByCode: vi.fn().mockResolvedValue(program),
      getShareLink: vi.fn().mockResolvedValue(
        openShareView({
          share_link: "",
          share_link_status: "closed",
          share_link_state: "expired",
          open_share_link: false,
        }),
      ),
    } as unknown as ProgramsClient;
    renderShare(client);
    await screen.findByRole("heading", { name: LINK_EXPIRES_HEADING });
    expect(screen.queryByText(SHARE_LINK_CLOSED_LINE)).toBeNull();
    expect(screen.queryByRole("button", { name: /Create a new link/i })).toBeNull();
    expect(document.querySelector(".pg-share-link-row")).toBeNull();
    expect(screen.queryByRole("button", { name: PUBLISH_COPY_LINK })).toBeNull();
    expect(screen.queryByRole("button", { name: SHARE_SEE_LINK_PAGE })).toBeNull();
    expect(screen.queryByRole("button", { name: /Download PDF/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Close link/ })).toBeInTheDocument();
  });

  it("hides expiry and share actions when the link is closed", async () => {
    const client = {
      getProgramByCode: vi.fn().mockResolvedValue(program),
      getShareLink: vi.fn().mockResolvedValue(
        openShareView({
          share_link_status: "closed",
          share_link_state: "closed",
          open_share_link: false,
          share_link: "https://physio.test.example/l/closed-token",
        }),
      ),
    } as unknown as ProgramsClient;
    renderShare(client);
    expect(await screen.findByText(SHARE_LINK_CLOSED_LINE)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: LINK_EXPIRES_HEADING })).toBeNull();
    expect(screen.queryByRole("button", { name: /Download PDF/ })).toBeNull();
    expect(screen.queryByRole("button", { name: SHARE_SEE_LINK_PAGE })).toBeNull();
    expect(document.querySelector(".pg-share-link-row")).toBeNull();
    expect(screen.queryByRole("button", { name: PUBLISH_COPY_LINK })).toBeNull();
  });

  it("opens the link page and calls print for Download PDF", async () => {
    const print = vi.fn();
    const opened = {
      print,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "load") {
          handler();
        }
      }),
      document: { readyState: "loading" },
    };
    vi.spyOn(window, "open").mockReturnValue(opened as unknown as Window);
    const client = {
      getProgramByCode: vi.fn().mockResolvedValue(program),
      getShareLink: vi.fn().mockResolvedValue(openShareView()),
    } as unknown as ProgramsClient;
    renderShare(client);
    const download = await screen.findByRole("button", { name: /Download PDF/ });
    await userEvent.click(download);
    expect(window.open).toHaveBeenCalledWith(
      "https://physio.test.example/l/open-token",
      "_blank",
      "noopener,noreferrer",
    );
    expect(print).toHaveBeenCalled();
  });

  it("PATCHes expiry when a different choice is selected", async () => {
    const setShareLinkExpiry = vi.fn().mockResolvedValue(
      openShareView({
        link_expires_in: "30_days",
        expires_at: "2026-11-23T12:00:00.000Z",
      }),
    );
    const client = {
      getProgramByCode: vi.fn().mockResolvedValue(program),
      getShareLink: vi.fn().mockResolvedValue(openShareView()),
      setShareLinkExpiry,
    } as unknown as ProgramsClient;
    renderShare(client);
    await screen.findByRole("button", { name: /Download PDF/ });
    await userEvent.click(screen.getByRole("button", { name: /30 days/ }));
    expect(setShareLinkExpiry).toHaveBeenCalledWith("p-share", {
      expires_in: "30_days",
      custom_expires_on: null,
    });
  });

  it("DELETEs the link after close-link confirmation", async () => {
    const closeShareLink = vi.fn().mockResolvedValue(
      openShareView({
        share_link_status: "closed",
        share_link_state: "closed",
        open_share_link: false,
      }),
    );
    const client = {
      getProgramByCode: vi.fn().mockResolvedValue(program),
      getShareLink: vi.fn().mockResolvedValue(openShareView()),
      closeShareLink,
    } as unknown as ProgramsClient;
    renderShare(client);
    await userEvent.click(await screen.findByRole("button", { name: /Close link/ }));
    const dialog = screen.getByRole("dialog", { name: CLOSE_LINK_SHEET_TITLE });
    await userEvent.click(
      within(dialog).getByRole("button", { name: CLOSE_LINK_CONFIRM }),
    );
    expect(closeShareLink).toHaveBeenCalledWith("p-share");
  });
});
