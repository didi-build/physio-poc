/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExerciseParams } from "../../src/domain/exercise-params.js";
import type { PrescriptionType } from "../../src/domain/exercise-types.js";
import { PRESCRIPTION_TYPES } from "../../src/domain/exercise-types.js";
import { TypeDefaultEditor } from "../../src/ui/my-defaults/TypeDefaultEditor.js";

afterEach(() => {
  cleanup();
});

const EDGE_CASE_OWN: Record<PrescriptionType, ExerciseParams> = {
  stretching: { hold_s: 30, per_day: 2, days_per_week: 4 },
  isometric: { reps: 1, hold_s: 10, sets: 1, days_per_week: 3 },
  concentric: {
    reps: 10,
    hold_s: 2,
    sets: 1,
    per_day: 2,
    ascent_s: 3,
    days_per_week: 3,
  },
  eccentric: { reps: 10, descent_s: 4, sets: 1, days_per_week: 3 },
};

describe("TypeDefaultEditor (jsdom)", () => {
  it("keeps the sets field visible while typing 1 then 10 and saves 10", async () => {
    const onSave = vi.fn();
    render(
      <TypeDefaultEditor
        type="concentric"
        own={null}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );

    const setsField = screen.getByRole("textbox", { name: "3 sets" });
    await userEvent.clear(setsField);
    await userEvent.type(setsField, "1");
    const setsAtOne = screen.getByRole("textbox", { name: "3 sets" });
    await userEvent.type(setsAtOne, "0");
    expect(screen.getByRole("textbox", { name: "3 sets" })).toHaveValue("10");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        sets: 10,
      }),
    );
  });

  it("shows a numeric per_day control for a saved scalar value", () => {
    render(
      <TypeDefaultEditor
        type="stretching"
        own={{ hold_s: 30, per_day: 2, days_per_week: 4 }}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("textbox", { name: "1 to 3 times a day" })).toHaveValue(
      "2",
    );
    expect(screen.queryByRole("option", { name: "2" })).not.toBeInTheDocument();
  });

  it("exhausts Add parameter without showing an Up field", async () => {
    render(
      <TypeDefaultEditor
        type="concentric"
        own={null}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    const addButton = screen.getByRole("button", { name: "Add parameter" });
    await userEvent.click(addButton);
    await userEvent.click(addButton);
    expect(
      screen.queryByRole("button", { name: "Add parameter" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("2s up")).not.toBeInTheDocument();
    expect(screen.queryByText("3s up")).not.toBeInTheDocument();
  });

  it("includes hidden ascent_s in the saved payload", async () => {
    const onSave = vi.fn();
    render(
      <TypeDefaultEditor
        type="concentric"
        own={{
          reps: 10,
          hold_s: 2,
          ascent_s: 3,
          sets: 3,
          days_per_week: 3,
        }}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ascent_s: 3,
      }),
    );
  });

  it("gives every rendered input a non-empty accessible name for each type", () => {
    for (const type of PRESCRIPTION_TYPES) {
      const { container, unmount } = render(
        <TypeDefaultEditor
          type={type}
          own={EDGE_CASE_OWN[type]}
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
      unmount();
    }
  });
});
