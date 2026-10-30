/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import { MyDefaultsClient } from "../../src/ui/api/my-defaults-client.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { PRESCRIPTION_TYPES } from "../../src/domain/exercise-types.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import {
  MY_DEFAULTS_PAGE_TITLE,
  RESET_TO_GLOBAL,
  SAVE,
  SHARE_LINK_EXPIRY_SECTION,
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

  it("saves share link expiry from a chip without a toast when the slot is undefined", async () => {
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
    expect(document.querySelector(".shell-toast-message")).toBeNull();
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

  it("saves a type default through the card via upsertTypeDefault", async () => {
    const savedParams = { hold_s: 50, per_day: 2, days_per_week: 4 };
    const upsertTypeDefault = vi.fn().mockResolvedValue({
      type: "stretching",
      global_params: GLOBAL_TYPE_DEFAULTS_SEED.stretching,
      practitioner_params: savedParams,
    });
    render(
      <MemoryRouter initialEntries={["/defaults"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          myDefaultsClient={stubMyDefaultsClient({ upsertTypeDefault })}
        />
      </MemoryRouter>,
    );

    const card = await screen.findByTestId("type-default-stretching");
    await userEvent.click(
      within(card).getByRole("button", {
        name: editYourTypeDefaultLabel(TYPE_LABELS.stretching),
      }),
    );
    const holdInput = within(card).getByDisplayValue("45");
    await userEvent.clear(holdInput);
    await userEvent.type(holdInput, "50");
    await userEvent.click(within(card).getByRole("button", { name: SAVE }));
    expect(upsertTypeDefault).toHaveBeenCalledWith("stretching", savedParams);
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
});
