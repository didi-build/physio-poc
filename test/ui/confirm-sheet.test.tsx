/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmSheet } from "../../src/ui/components/ConfirmSheet.js";

describe("ConfirmSheet", () => {
  it("renders a modal sheet with footer actions and closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ConfirmSheet
        open
        title="Restore this version?"
        titleId="confirm-title"
        onClose={onClose}
        footer={
          <button type="button" onClick={onClose}>
            Restore
          </button>
        }
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Restore this version?" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the scrim is clicked", () => {
    const onClose = vi.fn();

    const { container } = render(
      <ConfirmSheet
        open
        title="Restore this version?"
        titleId="confirm-title-2"
        onClose={onClose}
        footer={<span />}
      />,
    );

    const scrim = container.querySelector(".shell-sheet-scrim");
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim!);
    expect(onClose).toHaveBeenCalled();
  });
});
