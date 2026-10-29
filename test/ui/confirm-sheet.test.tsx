/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSheet } from "../../src/ui/components/ConfirmSheet.js";

afterEach(() => {
  cleanup();
});

const CONFIRM_TITLE = "Restore version 2?";

describe("ConfirmSheet", () => {
  it("renders nothing when open is false", () => {
    render(
      <ConfirmSheet
        open={false}
        title={CONFIRM_TITLE}
        titleId="confirm-closed"
        onClose={() => {}}
        footer={<span />}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sets aria-modal and accessible name from aria-labelledby", () => {
    render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-title"
        onClose={() => {}}
        footer={<span />}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: CONFIRM_TITLE });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "confirm-title");
  });

  it("renders the footer action", () => {
    render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-footer"
        onClose={() => {}}
        footer={
          <button type="button" onClick={() => {}}>
            Restore as version 3
          </button>
        }
      />,
    );

    expect(
      screen.getByRole("button", { name: "Restore as version 3" }),
    ).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();

    render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-escape"
        onClose={onClose}
        footer={<span />}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the close sheet button is clicked", () => {
    const onClose = vi.fn();

    render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-close-btn"
        onClose={onClose}
        footer={<span />}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: CONFIRM_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close sheet" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the scrim is clicked", () => {
    const onClose = vi.fn();

    const { container } = render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-scrim"
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
