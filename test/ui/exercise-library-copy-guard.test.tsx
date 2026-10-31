/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  EXERCISE_LIBRARY_DETAIL_ERROR_MESSAGE,
  EXERCISE_LIBRARY_LIST_ERROR_MESSAGE,
} from "../../src/ui/copy/exercise-library-states.js";
import {
  ExerciseLibraryErrorSlot,
  ExerciseLibraryDetailErrorSlot,
} from "../../src/ui/exercise-library/ExerciseLibraryStates.js";
import { UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS } from "./exercise-library-unsourced-guard.js";
import {
  BACK_LIBRARY,
  EXERCISE_DETAILS,
  PINNED_PREFIX,
  editsOnTopOfLibraryLine,
} from "../../src/ui/copy/exercise-library.js";
import { TOAST_UNDO } from "../../src/ui/copy/nav.js";
import {
  countMyCopyEdits,
  myCopyStatusLine,
} from "../../src/ui/exercise-library/my-copy-status.js";
import {
  LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
  assertExerciseLibraryErrorPageCopy,
  assertLoadingErrorRegionsOnlyAllowlisted,
  assertPageTextOnlyFromAllowlist,
  assertUnsourcedGuardListNonEmpty,
  exerciseLibraryDetailsErrorPageAllowlist,
  exerciseLibraryDetailsErrorPageSegmentLimits,
} from "./exercise-library-loading-error-copy-guard.js";

function minimalDetailsErrorPageShell(): HTMLElement {
  const page = document.createElement("div");
  const back = document.createElement("a");
  back.textContent = BACK_LIBRARY;
  const heading = document.createElement("h1");
  heading.textContent = EXERCISE_DETAILS;
  page.append(back, heading);
  return page;
}

afterEach(() => {
  cleanup();
});

function regionWithText(testId: string, text: string): HTMLElement {
  const root = document.createElement("div");
  const node = document.createElement("div");
  node.dataset.testid = testId;
  node.textContent = text;
  root.appendChild(node);
  return root;
}

describe("exercise library loading/error copy guard", () => {
  it("keeps list and detail error copy slots undefined", () => {
    expect(EXERCISE_LIBRARY_LIST_ERROR_MESSAGE).toBeUndefined();
    expect(EXERCISE_LIBRARY_DETAIL_ERROR_MESSAGE).toBeUndefined();
  });

  it("requires a non-empty unsourced phrase guard list", () => {
    assertUnsourcedGuardListNonEmpty();
    expect(UNSOURCED_EXERCISE_LIBRARY_UI_STRINGS.length).toBeGreaterThan(0);
  });

  it("allows empty loading/error regions when slots are undefined", () => {
    const { container } = render(
      <>
        <ExerciseLibraryDetailErrorSlot />
        <ExerciseLibraryErrorSlot
          message={undefined}
          testId="exercise-library-list-error-slot"
        />
      </>,
    );
    assertLoadingErrorRegionsOnlyAllowlisted(
      container,
      LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
    );
    expect(container.textContent?.includes("undefined")).toBe(false);
  });

  it("mutation: rejects Failed to load exercise in an error region", () => {
    expect(() =>
      assertLoadingErrorRegionsOnlyAllowlisted(
        regionWithText("exercise-library-detail-error-slot", "Failed to load exercise"),
        LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
      ),
    ).toThrow();
  });

  it("mutation: rejects the literal undefined in an error region", () => {
    expect(() =>
      assertLoadingErrorRegionsOnlyAllowlisted(
        regionWithText("exercise-library-detail-error-slot", "undefined"),
        LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
      ),
    ).toThrow();
  });

  it("mutation: rejects invented copy in an error region", () => {
    expect(() =>
      assertLoadingErrorRegionsOnlyAllowlisted(
        regionWithText("exercise-library-list-error-slot", "Something went wrong"),
        LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
      ),
    ).toThrow();
  });

  it("mutation: rejects unsourced busy-state copy", () => {
    expect(() =>
      assertLoadingErrorRegionsOnlyAllowlisted(
        regionWithText("exercise-library-busy-skeleton", "Loading…"),
        LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
      ),
    ).toThrow();
  });

  it("mutation: an emptied guard list fails the non-empty assertion", () => {
    expect(() => assertUnsourcedGuardListNonEmpty([])).toThrow(
      "Unsourced guard list must not be empty",
    );
  });

  it("mutation: whole details error page rejects literal undefined beside the slot", () => {
    const page = minimalDetailsErrorPageShell();
    const stray = document.createElement("p");
    stray.textContent = "undefined";
    page.append(stray);
    expect(() =>
      assertExerciseLibraryErrorPageCopy(
        page,
        exerciseLibraryDetailsErrorPageAllowlist(),
        exerciseLibraryDetailsErrorPageSegmentLimits(),
      ),
    ).toThrow();
  });

  it("mutation: whole details error page rejects Something went wrong beside the slot", () => {
    const page = minimalDetailsErrorPageShell();
    const stray = document.createElement("p");
    stray.textContent = "Something went wrong";
    page.append(stray);
    expect(() =>
      assertExerciseLibraryErrorPageCopy(
        page,
        exerciseLibraryDetailsErrorPageAllowlist(),
        exerciseLibraryDetailsErrorPageSegmentLimits(),
      ),
    ).toThrow();
  });

  it("mutation: whole details error page rejects DK injected beside the slot", () => {
    const page = minimalDetailsErrorPageShell();
    const stray = document.createElement("p");
    stray.textContent = "DK";
    page.append(stray);
    expect(() =>
      assertExerciseLibraryErrorPageCopy(
        page,
        exerciseLibraryDetailsErrorPageAllowlist(),
        exerciseLibraryDetailsErrorPageSegmentLimits(),
      ),
    ).toThrow();
  });

  it("mutation: whole details error page rejects extra Library injected beside the slot", () => {
    const page = minimalDetailsErrorPageShell();
    const stray = document.createElement("p");
    stray.textContent = BACK_LIBRARY;
    page.append(stray);
    expect(() =>
      assertExerciseLibraryErrorPageCopy(
        page,
        exerciseLibraryDetailsErrorPageAllowlist(),
        exerciseLibraryDetailsErrorPageSegmentLimits(),
      ),
    ).toThrow();
  });

  it("counts param_overrides toward my copy edit count", () => {
    const editCount = countMyCopyEdits({
      resolved_text: [
        {
          key: "title",
          resolved: "Calf stretch",
          library_value: "Calf stretch",
          library_updated: false,
        },
      ],
      param_overrides: { stretching: { hold: "45" } },
    } as unknown as Parameters<typeof countMyCopyEdits>[0]);
    expect(editCount).toBe(1);
  });

  it("myCopyStatusLine uses params-only overrides like mock ex13", () => {
    const line = myCopyStatusLine({
      favourite: true,
      resolved_text: [
        {
          key: "title",
          resolved: "Calf stretch",
          library_value: "Calf stretch",
          library_updated: false,
        },
      ],
      param_overrides: {
        stretching: { hold: "45", perDay: "2", daysPerWeek: "7" },
      },
    } as unknown as Parameters<typeof myCopyStatusLine>[0]);
    expect(line).toBe(`${PINNED_PREFIX}${editsOnTopOfLibraryLine(1)}`);
  });

  it("mutation: whole details error page rejects sr-only text injected beside the slot", () => {
    const page = minimalDetailsErrorPageShell();
    const stray = document.createElement("span");
    stray.className = "sr-only";
    stray.textContent = "Oops";
    page.append(stray);
    expect(() =>
      assertExerciseLibraryErrorPageCopy(
        page,
        exerciseLibraryDetailsErrorPageAllowlist(),
        exerciseLibraryDetailsErrorPageSegmentLimits(),
      ),
    ).toThrow();
  });

  it("mutation: whole details error page rejects Undo injected beside the slot", () => {
    const page = minimalDetailsErrorPageShell();
    const stray = document.createElement("span");
    stray.className = "sr-only";
    stray.textContent = TOAST_UNDO;
    page.append(stray);
    expect(() =>
      assertExerciseLibraryErrorPageCopy(
        page,
        exerciseLibraryDetailsErrorPageAllowlist(),
        exerciseLibraryDetailsErrorPageSegmentLimits(),
      ),
    ).toThrow();
  });
});

describe("whole-page allowlist helper", () => {
  it("mutation: assertPageTextOnlyFromAllowlist fails on stray copy", () => {
    const page = document.createElement("div");
    const allowed = document.createElement("p");
    allowed.textContent = "Allowed only";
    const stray = document.createElement("p");
    stray.textContent = "stray";
    page.append(allowed, stray);
    expect(() =>
      assertPageTextOnlyFromAllowlist(page, ["Allowed only"], { "Allowed only": 1 }),
    ).toThrow();
  });
});
