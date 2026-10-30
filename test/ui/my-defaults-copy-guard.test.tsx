/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import {
  MyDefaultsClient,
  setMyDefaultsClientForTests,
} from "../../src/ui/api/my-defaults-client.js";
import { TypeDefaultEditor } from "../../src/ui/my-defaults/TypeDefaultEditor.js";

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

const REMOVED_COPY = [
  "once a day",
  "twice a day",
  "1 set",
  "1 sets",
  "2s up",
  "3s up",
  "New links will expire after 30 days",
  "New links will expire after 90 days",
  "New links will expire after 1 year",
] as const;

describe("My defaults removed copy (integration, jsdom)", () => {
  it("does not render copy removed pending Designer spec", async () => {
    render(
      <MemoryRouter initialEntries={["/defaults"]}>
        <PhysioApp
          exerciseLibraryClient={stubLibraryClient()}
          myDefaultsClient={stubMyDefaultsClient()}
        />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "My defaults" });
    for (const text of REMOVED_COPY) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
    }
  });

  it("does not toast generic expire-after copy for 30 days", async () => {
    const updateShareLinkExpiry = vi.fn().mockResolvedValue({
      global: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
      practitioner: {
        expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days,
        customExpiresOn: null,
      },
      effective: {
        expiresIn: SHARE_LINK_EXPIRES_IN.thirty_days,
        customExpiresOn: null,
      },
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
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(updateShareLinkExpiry).toHaveBeenCalled();
    expect(screen.queryByText(/New links will expire after/i)).not.toBeInTheDocument();
  });
});

describe("TypeDefaultEditor accessibility (jsdom)", () => {
  it("gives every rendered input a non-empty accessible name", () => {
    const { container } = render(
      <TypeDefaultEditor
        type="stretching"
        own={null}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const fields = container.querySelectorAll("input, select");
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      const name =
        field.getAttribute("aria-label") ??
        (field.id
          ? container.querySelector(`label[for="${field.id}"]`)?.textContent
          : null);
      expect(name?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it("per-day select only lists mock-approved range labels", () => {
    render(
      <TypeDefaultEditor
        type="stretching"
        own={null}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const select = screen.getByRole("combobox", { name: "1 to 3 times a day" });
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("1 to 3 times a day");
    expect(screen.queryByRole("option", { name: "1" })).not.toBeInTheDocument();
  });

  it("does not offer ascent_s in Add parameter", () => {
    render(
      <TypeDefaultEditor
        type="concentric"
        own={null}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Add parameter" })).toBeInTheDocument();
    expect(screen.queryByText("2s up")).not.toBeInTheDocument();
  });
});
