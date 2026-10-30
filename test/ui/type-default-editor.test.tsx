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
import {
  TYPE_DEFAULT_ADDABLE_PARAMS,
  addableTypeDefaultParams,
} from "../../src/domain/type-default-param-layout.js";
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

    const inputs = screen.getAllByRole("textbox");
    expect(inputs[0]).toHaveValue("10");
    expect(inputs[1]).toHaveValue("2");
    const setsField = inputs[2]!;
    expect(setsField).toHaveValue("3");
    await userEvent.clear(setsField);
    await userEvent.type(setsField, "1");
    expect(setsField).toHaveValue("1");
    await userEvent.type(setsField, "0");
    expect(setsField).toHaveValue("10");
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
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "2" })).not.toBeInTheDocument();
  });

  it("does not offer ascent_s (Up) in Add parameter for any type", () => {
    expect(TYPE_DEFAULT_ADDABLE_PARAMS).not.toContain("ascent_s");
    for (const type of PRESCRIPTION_TYPES) {
      expect(addableTypeDefaultParams(type, {})).not.toContain("ascent_s");
    }
  });

  it("does not render an input for stored ascent_s", () => {
    const { container } = render(
      <TypeDefaultEditor
        type="concentric"
        own={{
          reps: 10,
          hold_s: 2,
          ascent_s: 3,
          sets: 3,
          days_per_week: 3,
        }}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.querySelectorAll("input.md-param-input")).toHaveLength(4);
  });

  it("exhausts Add parameter with only approved addable params", async () => {
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
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
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
