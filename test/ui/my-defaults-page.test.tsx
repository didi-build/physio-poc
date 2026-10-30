/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  MyDefaultsClient,
  setMyDefaultsClientForTests,
} from "../../src/ui/api/my-defaults-client.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { PRESCRIPTION_TYPES } from "../../src/domain/exercise-types.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import {
  MY_DEFAULTS_PAGE_TITLE,
  RESET_TO_GLOBAL,
  SHARE_LINK_EXPIRY_SECTION,
  NEW_LINKS_EXPIRE_AFTER_ONE_WEEK,
  TYPE_LABELS,
  YOUR_DEFAULT_BADGE,
  editYourTypeDefaultLabel,
} from "../../src/ui/copy/my-defaults.js";
import { typeDefaultEditorTypeTitleId } from "../../src/ui/my-defaults/type-default-editor-a11y.js";
import {
  EDGE_CASE_OWN,
  resolveAriaLabelledByName,
} from "./type-default-editor-a11y-helpers.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setMyDefaultsClientForTests(null);
  vi.unstubAllGlobals();
});

function stubMatchMedia(viewportWidth: number): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => {
      const minWidthMatch = query.match(/min-width:\s*(\d+)px/);
      const matches =
        minWidthMatch !== null ? viewportWidth >= Number(minWidthMatch[1]) : false;
      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
    writable: true,
  });
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

function stubMyDefaultsClient(
  overrides: Partial<MyDefaultsClient> = {},
): MyDefaultsClient {
  return {
    getPage: vi.fn().mockResolvedValue({
      share_link_expiry: {
        global: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
        practitioner: null,
        effective: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
      },
      exercise_types: PRESCRIPTION_TYPES.map((type) => ({
        type,
        global_params: GLOBAL_TYPE_DEFAULTS_SEED[type],
        practitioner_params: EDGE_CASE_OWN[type],
      })),
    }),
    updateShareLinkExpiry: vi.fn(),
    upsertTypeDefault: vi.fn(),
    resetTypeDefault: vi.fn(),
    ...overrides,
  } as unknown as MyDefaultsClient;
}

describe("My defaults page (integration, jsdom)", () => {
  it("renders spec copy and global 1 year expiry", async () => {
    render(
      <MemoryRouter initialEntries={["/defaults"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          myDefaultsClient={stubMyDefaultsClient()}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: MY_DEFAULTS_PAGE_TITLE }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: SHARE_LINK_EXPIRY_SECTION }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Global default: 1 year\./)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "1 year", pressed: true }),
    ).toBeInTheDocument();
  });

  it("does not show Your default badge when share link expiry matches global", async () => {
    render(
      <MemoryRouter initialEntries={["/defaults"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          myDefaultsClient={stubMyDefaultsClient()}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: SHARE_LINK_EXPIRY_SECTION });
    const expiryPanel = screen.getByRole("heading", {
      name: SHARE_LINK_EXPIRY_SECTION,
    }).parentElement;
    expect(expiryPanel).not.toBeNull();
    expect(
      within(expiryPanel!).queryByText(YOUR_DEFAULT_BADGE),
    ).not.toBeInTheDocument();
  });

  it("saves share link expiry from a chip and shows the toast", async () => {
    const updateShareLinkExpiry = vi.fn().mockResolvedValue({
      global: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
      practitioner: {
        expiresIn: SHARE_LINK_EXPIRES_IN.one_week,
        customExpiresOn: null,
      },
      effective: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week, customExpiresOn: null },
    });
    render(
      <MemoryRouter initialEntries={["/defaults"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          myDefaultsClient={stubMyDefaultsClient({ updateShareLinkExpiry })}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "1 year", pressed: true });
    await userEvent.click(screen.getByRole("button", { name: "1 week" }));
    expect(updateShareLinkExpiry).toHaveBeenCalledWith(SHARE_LINK_EXPIRES_IN.one_week);
    expect(
      await screen.findByText(NEW_LINKS_EXPIRE_AFTER_ONE_WEEK),
    ).toBeInTheDocument();
  });

  it("calls reset to global for a practitioner type override", async () => {
    const resetTypeDefault = vi.fn().mockResolvedValue({
      type: "concentric",
      global_params: GLOBAL_TYPE_DEFAULTS_SEED.concentric,
      practitioner_params: null,
    });
    render(
      <MemoryRouter initialEntries={["/defaults"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          myDefaultsClient={stubMyDefaultsClient({ resetTypeDefault })}
        />
      </MemoryRouter>,
    );

    const card = await screen.findByTestId("type-default-concentric");
    const resetButton = within(card).getByRole("button", { name: RESET_TO_GLOBAL });
    await userEvent.click(resetButton);
    expect(resetTypeDefault).toHaveBeenCalledWith("concentric");
  });

  it("resolves every dose input name through its card heading on the page", async () => {
    render(
      <MemoryRouter initialEntries={["/defaults"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          myDefaultsClient={stubMyDefaultsClient()}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: MY_DEFAULTS_PAGE_TITLE });

    for (const type of PRESCRIPTION_TYPES) {
      const card = screen.getByTestId(`type-default-${type}`);
      await userEvent.click(
        within(card).getByRole("button", {
          name: editYourTypeDefaultLabel(TYPE_LABELS[type]),
        }),
      );
      const heading = within(card).getByRole("heading", { level: 2 });
      expect(heading.id).toBe(typeDefaultEditorTypeTitleId(type));
      const fields = card.querySelectorAll(
        "input.md-param-input, select.md-param-input",
      );
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        const labelledBy = field.getAttribute("aria-labelledby") ?? "";
        expect(labelledBy.split(/\s+/)).toContain(heading.id);
        expect(resolveAriaLabelledByName(field).length).toBeGreaterThan(0);
        expect(document.getElementById(heading.id)).toBe(heading);
      }
    }
  });

  describe.each([
    { label: "390px phone", width: 390 },
    { label: "1280px desktop", width: 1280 },
  ])("at $label", ({ width }) => {
    beforeEach(() => {
      stubMatchMedia(width);
    });

    it("renders share link expiry and exercise type sections", async () => {
      render(
        <MemoryRouter initialEntries={["/defaults"]}>
          <PhysioApp
            exerciseLibraryClient={stubLibraryClient()}
            myDefaultsClient={stubMyDefaultsClient()}
          />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole("heading", { name: MY_DEFAULTS_PAGE_TITLE }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: SHARE_LINK_EXPIRY_SECTION }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("type-default-stretching")).toBeInTheDocument();
    });
  });
});
