/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRESCRIPTION_TYPES } from "../../src/domain/exercise-types.js";
import {
  TYPE_DEFAULT_ADDABLE_PARAMS,
  addableTypeDefaultParams,
} from "../../src/domain/type-default-param-layout.js";
import {
  EDGE_CASE_OWN,
  renderTypeDefaultEditor,
  resolveAriaLabelledByName,
  valueDerivedAccessibleName,
} from "./type-default-editor-a11y-helpers.js";

afterEach(() => {
  cleanup();
});

describe("TypeDefaultEditor (jsdom)", () => {
  it("keeps the sets field visible while typing 1 then 10 and saves 10", async () => {
    const onSave = vi.fn();
    renderTypeDefaultEditor({
      type: "concentric",
      own: null,
      onSave,
      onCancel: () => {},
    });

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
    renderTypeDefaultEditor({
      type: "stretching",
      own: { hold_s: 30, per_day: 2, days_per_week: 4 },
      onSave: () => {},
      onCancel: () => {},
    });
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
    const { container } = renderTypeDefaultEditor({
      type: "concentric",
      own: {
        reps: 10,
        hold_s: 2,
        ascent_s: 3,
        sets: 3,
        days_per_week: 3,
      },
      onSave: () => {},
      onCancel: () => {},
    });
    expect(container.querySelectorAll("input.md-param-input")).toHaveLength(4);
  });

  it("exhausts Add parameter with only approved addable params", async () => {
    renderTypeDefaultEditor({
      type: "concentric",
      own: null,
      onSave: () => {},
      onCancel: () => {},
    });
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
    renderTypeDefaultEditor({
      type: "concentric",
      own: {
        reps: 10,
        hold_s: 2,
        ascent_s: 3,
        sets: 3,
        days_per_week: 3,
      },
      onSave,
      onCancel: () => {},
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ascent_s: 3,
      }),
    );
  });

  it("gives every dose input a non-empty accessible name via aria-labelledby", () => {
    for (const type of PRESCRIPTION_TYPES) {
      const { container, unmount } = renderTypeDefaultEditor({
        type,
        own: EDGE_CASE_OWN[type],
        onSave: () => {},
        onCancel: () => {},
      });
      const fields = container.querySelectorAll(
        "input.md-param-input, select.md-param-input",
      );
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field.getAttribute("aria-label")).toBeNull();
        expect(resolveAriaLabelledByName(field).length).toBeGreaterThan(0);
      }
      unmount();
    }
  });

  it("does not put the field value into the accessible name", () => {
    for (const type of PRESCRIPTION_TYPES) {
      const { container, unmount } = renderTypeDefaultEditor({
        type,
        own: EDGE_CASE_OWN[type],
        onSave: () => {},
        onCancel: () => {},
      });
      const fields = container.querySelectorAll(
        "input.md-param-input, select.md-param-input",
      );
      for (const field of fields) {
        const value = (field as HTMLInputElement).value?.trim() ?? "";
        const name = resolveAriaLabelledByName(field);
        if (value.length > 0) {
          expect(name).not.toContain(value);
          expect(name).not.toBe(valueDerivedAccessibleName(value));
        }
      }
      unmount();
    }
  });

  it("fails the value-in-name guard when names are mutated to value-derived labels", () => {
    const { container } = renderTypeDefaultEditor({
      type: "stretching",
      own: EDGE_CASE_OWN.stretching,
      onSave: () => {},
      onCancel: () => {},
    });
    const holdField = container.querySelector(
      "input.md-param-input",
    ) as HTMLInputElement;
    const value = holdField.value;
    const goodName = resolveAriaLabelledByName(holdField);
    expect(goodName).not.toBe(valueDerivedAccessibleName(value));
    expect(() => {
      expect(valueDerivedAccessibleName(value)).toBe(valueDerivedAccessibleName(value));
      expect(goodName).toBe(valueDerivedAccessibleName(value));
    }).toThrow();
  });
});
