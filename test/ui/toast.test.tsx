/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../../src/ui/components/Toast.js";

describe("Toast", () => {
  it("renders bottom toast with Undo", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();

    function Probe() {
      const { showToast } = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            showToast({
              message: "Removed Example from My exercises",
              onUndo,
            });
          }}
        >
          Show
        </button>
      );
    }

    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Show" }));

    const status = screen.getByRole("status");
    expect(status).toHaveClass("shell-toast");
    expect(screen.getByText("Removed Example from My exercises")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
