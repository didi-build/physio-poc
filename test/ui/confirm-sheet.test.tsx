/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "./setup.js";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSheet } from "../../src/ui/components/ConfirmSheet.js";
import { ARIA_CLOSE_SCRIM, ARIA_CLOSE_SHEET } from "../../src/ui/copy/a11y.js";

afterEach(() => {
  cleanup();
});

const CONFIRM_TITLE = "Restore version 2?";
const CONFIRM_SHEET_PATH = join(
  import.meta.dirname,
  "../../src/ui/components/ConfirmSheet.tsx",
);

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

  it("focuses the close sheet button when opened", () => {
    render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-focus-open"
        onClose={() => {}}
        footer={<button type="button">Restore as version 3</button>}
      />,
    );

    expect(document.activeElement).toHaveAccessibleName(ARIA_CLOSE_SHEET);
  });

  it("wraps Tab and Shift+Tab within the sheet", () => {
    render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-trap"
        onClose={() => {}}
        footer={
          <>
            <button type="button">First action</button>
            <button type="button">Last action</button>
          </>
        }
      />,
    );

    const dialog = screen.getByRole("dialog", { name: CONFIRM_TITLE });
    const closeBtn = within(dialog).getByRole("button", { name: ARIA_CLOSE_SHEET });
    const last = within(dialog).getByRole("button", { name: "Last action" });

    expect(document.activeElement).toBe(closeBtn);

    last.focus();
    fireEvent.keyDown(window, { key: "Tab", code: "Tab" });
    expect(document.activeElement).toBe(closeBtn);

    closeBtn.focus();
    fireEvent.keyDown(window, { key: "Tab", code: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("returns focus to the opener when closed", () => {
    const opener = document.createElement("button");
    opener.textContent = "Opener";
    document.body.appendChild(opener);
    opener.focus();

    const onClose = vi.fn();
    const { rerender } = render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-focus-return"
        onClose={onClose}
        footer={<span />}
      />,
    );

    expect(document.activeElement).toHaveAccessibleName(ARIA_CLOSE_SHEET);

    rerender(
      <ConfirmSheet
        open={false}
        title={CONFIRM_TITLE}
        titleId="confirm-focus-return"
        onClose={onClose}
        footer={<span />}
      />,
    );

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("does not steal focus when the parent re-renders with a new inline onClose", () => {
    function Parent() {
      const [count, setCount] = useState(0);
      return (
        <ConfirmSheet
          open
          title={CONFIRM_TITLE}
          titleId="confirm-inline-close"
          onClose={() => {
            setCount((value) => value + 1);
          }}
          footer={
            <button type="button" onClick={() => setCount((value) => value + 1)}>
              Bump {count}
            </button>
          }
        />
      );
    }

    render(<Parent />);
    const dialog = screen.getByRole("dialog", { name: CONFIRM_TITLE });
    const bump = within(dialog).getByRole("button", { name: "Bump 0" });
    bump.focus();
    fireEvent.click(bump);

    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Bump 1" }),
    );
    expect(document.activeElement).not.toHaveAccessibleName(ARIA_CLOSE_SHEET);
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
    fireEvent.click(within(dialog).getByRole("button", { name: ARIA_CLOSE_SHEET }));
    expect(onClose).toHaveBeenCalled();
  });

  it("labels the scrim from the a11y copy module", () => {
    expect(ARIA_CLOSE_SCRIM).toBe("Close");

    const source = readFileSync(CONFIRM_SHEET_PATH, "utf8");
    expect(source).toContain("ARIA_CLOSE_SCRIM");
    expect(source).toMatch(/aria-label=\{ARIA_CLOSE_SCRIM\}/);

    render(
      <ConfirmSheet
        open
        title={CONFIRM_TITLE}
        titleId="confirm-scrim-label"
        onClose={() => {}}
        footer={<span />}
      />,
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveClass(
      "shell-sheet-scrim",
    );
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
