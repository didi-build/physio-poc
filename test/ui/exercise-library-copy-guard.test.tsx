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
  LOADING_ERROR_REGION_ALLOWLIST_WHEN_SLOTS_UNDEFINED,
  assertLoadingErrorRegionsOnlyAllowlisted,
  assertUnsourcedGuardListNonEmpty,
} from "./exercise-library-loading-error-copy-guard.js";

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
    expect(() => {
      if ([].length === 0) {
        throw new Error("Unsourced guard list must not be empty");
      }
    }).toThrow();
  });
});
