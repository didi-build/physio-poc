/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExerciseParams } from "../../src/domain/exercise-params.js";
import { formatExerciseParams } from "../../src/domain/format-exercise-params.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import { PhysioApp } from "../../src/ui/App.js";
import {
  ExerciseLibraryClient,
  setExerciseLibraryClientForTests,
} from "../../src/ui/api/exercise-library-client.js";
import type { MyDefaultsClient } from "../../src/ui/api/my-defaults-client.js";
import {
  myDefaultsPendingCopySlots,
  type MyDefaultsPendingCopySlots,
} from "../../src/ui/copy/my-defaults-pending-copy.js";
import { renderTypeDefaultEditor } from "./type-default-editor-a11y-helpers.js";

const FIXTURE_TOAST = "fixture-share-link-expiry-toast";
const FIXTURE_PER_DAY_ONCE = "fixture-readout-once-a-day";
const FIXTURE_PER_DAY_RANGE = "fixture-readout-per-day-range";
const FIXTURE_ONE_SET = "fixture-readout-one-set";
const FIXTURE_SECONDS_UP = "fixture-readout-seconds-up";

const GUARD_FIXTURE_PARAMS: ExerciseParams = {
  reps: 10,
  hold_s: 2,
  sets: 1,
  per_day: 2,
  ascent_s: 3,
  days_per_week: 3,
};

function snapshotPendingCopySlots(): MyDefaultsPendingCopySlots {
  return { ...myDefaultsPendingCopySlots };
}

function restorePendingCopySlots(snapshot: MyDefaultsPendingCopySlots): void {
  Object.assign(myDefaultsPendingCopySlots, snapshot);
}

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
      exercise_types: [
        {
          type: "stretching",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.stretching,
          practitioner_params: { hold_s: 30, per_day: 1, days_per_week: 4 },
        },
        {
          type: "concentric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.concentric,
          practitioner_params: GUARD_FIXTURE_PARAMS,
        },
      ],
    }),
    updateShareLinkExpiry: vi.fn(),
    upsertTypeDefault: vi.fn(),
    resetTypeDefault: vi.fn(),
    ...overrides,
  } as unknown as MyDefaultsClient;
}

describe("My defaults pending copy slots (integration, jsdom)", () => {
  it("does not render share-link expiry changed toast when the slot is undefined", async () => {
    const snapshot = snapshotPendingCopySlots();
    myDefaultsPendingCopySlots.shareLinkExpiryChangedToast = undefined;
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
    try {
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
      expect(screen.queryByText(FIXTURE_TOAST)).not.toBeInTheDocument();
    } finally {
      restorePendingCopySlots(snapshot);
    }
  });

  it("renders share-link expiry changed toast when the slot is set", async () => {
    const snapshot = snapshotPendingCopySlots();
    myDefaultsPendingCopySlots.shareLinkExpiryChangedToast = FIXTURE_TOAST;
    const updateShareLinkExpiry = vi.fn().mockResolvedValue({
      global: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
      practitioner: {
        expiresIn: SHARE_LINK_EXPIRES_IN.one_week,
        customExpiresOn: null,
      },
      effective: { expiresIn: SHARE_LINK_EXPIRES_IN.one_week, customExpiresOn: null },
    });
    try {
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
      expect(await screen.findByText(FIXTURE_TOAST)).toBeInTheDocument();
    } finally {
      restorePendingCopySlots(snapshot);
    }
  });

  it("does not render readout phrases when readout slots are undefined", () => {
    const readout = formatExerciseParams(GUARD_FIXTURE_PARAMS);
    expect(readout).not.toContain(FIXTURE_PER_DAY_ONCE);
    expect(readout).not.toContain(FIXTURE_ONE_SET);
    expect(readout).not.toContain(FIXTURE_SECONDS_UP);

    const { container } = renderTypeDefaultEditor({
      type: "concentric",
      own: GUARD_FIXTURE_PARAMS,
      onSave: () => {},
      onCancel: () => {},
    });
    const readsAs = container.querySelector(".md-reads-as");
    expect(readsAs?.textContent ?? "").not.toContain(FIXTURE_PER_DAY_RANGE);
  });

  it("renders readout phrases when readout slots are set in the test fixture", () => {
    const copy = {
      ...myDefaultsPendingCopySlots,
      readoutOnceADay: FIXTURE_PER_DAY_ONCE,
      readoutPerDayRange: () => FIXTURE_PER_DAY_RANGE,
      readoutOneSet: FIXTURE_ONE_SET,
      readoutSecondsUp: () => FIXTURE_SECONDS_UP,
    };
    const readout = formatExerciseParams({ per_day: { min: 1, max: 3 } }, copy);
    expect(readout).toContain(FIXTURE_PER_DAY_RANGE);
    expect(formatExerciseParams({ per_day: 1 }, copy)).toContain(FIXTURE_PER_DAY_ONCE);
  });
});
