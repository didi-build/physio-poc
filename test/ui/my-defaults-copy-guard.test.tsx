/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatExerciseParams } from "../../src/domain/format-exercise-params.js";
import type { ExerciseParams } from "../../src/domain/exercise-params.js";
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

const GUARD_FIXTURE_PARAMS: ExerciseParams = {
  reps: 10,
  hold_s: 2,
  sets: 1,
  per_day: 2,
  ascent_s: 3,
  days_per_week: 3,
};

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
          practitioner_params: { hold_s: 30, per_day: 1, days_per_week: 4 },
        },
        {
          type: "isometric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.isometric,
          practitioner_params: { reps: 1, hold_s: 10, sets: 1, days_per_week: 3 },
        },
        {
          type: "concentric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.concentric,
          practitioner_params: GUARD_FIXTURE_PARAMS,
        },
        {
          type: "eccentric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.eccentric,
          practitioner_params: {
            reps: 10,
            descent_s: 4,
            sets: 1,
            per_day: 2,
            ascent_s: 3,
            days_per_week: 3,
          },
        },
      ],
    }),
    updateShareLinkExpiry: vi.fn(),
    upsertTypeDefault: vi.fn(),
    resetTypeDefault: vi.fn(),
    ...overrides,
  } as unknown as MyDefaultsClient;
}

describe("My defaults removed copy (integration, jsdom)", () => {
  it("does not render copy removed pending Designer spec on the page", async () => {
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

  it("does not render removed readout phrases for guard fixture params", () => {
    const readout = formatExerciseParams(GUARD_FIXTURE_PARAMS);
    for (const text of REMOVED_COPY) {
      expect(readout.includes(text)).toBe(false);
    }
    const { container } = render(
      <TypeDefaultEditor
        type="concentric"
        own={GUARD_FIXTURE_PARAMS}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const readsAs = container.querySelector(".md-reads-as");
    expect(readsAs?.textContent ?? "").not.toMatch(/once a day/);
    expect(readsAs?.textContent ?? "").not.toMatch(/1 set/);
    expect(readsAs?.textContent ?? "").not.toMatch(/3s up/);
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
