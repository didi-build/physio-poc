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
import {
  MyDefaultsClient,
  setMyDefaultsClientForTests,
} from "../../src/ui/api/my-defaults-client.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import {
  MY_DEFAULTS_PAGE_TITLE,
  RESET_TO_GLOBAL,
  SHARE_LINK_EXPIRY_SECTION,
  YOUR_DEFAULT_BADGE,
  newLinksExpireAfterLabel,
} from "../../src/ui/copy/my-defaults.js";

afterEach(() => {
  cleanup();
  setExerciseLibraryClientForTests(null);
  setMyDefaultsClientForTests(null);
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
      exercise_types: [
        {
          type: "stretching",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.stretching,
          practitioner_params: null,
        },
        {
          type: "isometric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.isometric,
          practitioner_params: null,
        },
        {
          type: "concentric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.concentric,
          practitioner_params: {
            reps: 12,
            hold_s: 2,
            sets: 3,
            rest_s: 60,
            days_per_week: 3,
          },
        },
        {
          type: "eccentric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.eccentric,
          practitioner_params: null,
        },
      ],
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
      await screen.findByText(newLinksExpireAfterLabel("1 week")),
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
});
