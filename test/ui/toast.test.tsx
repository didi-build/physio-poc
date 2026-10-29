/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../../src/ui/components/Toast.js";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function ToastProbe({ message, onUndo }: { message: string; onUndo?: () => void }) {
    const { showToast } = useToast();
    return (
      <button
        type="button"
        onClick={() => {
          showToast({ message, onUndo });
        }}
      >
        Show toast
      </button>
    );
  }

  it("uses a persistent aria-live region", () => {
    const { container } = render(
      <ToastProvider>
        <span>Child</span>
      </ToastProvider>,
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
    expect(live).toHaveAttribute("aria-atomic", "true");
  });

  it("dismisses a toast with Undo after 5 seconds", () => {
    render(
      <ToastProvider>
        <ToastProbe message="Saved to My exercises" onUndo={() => {}} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
    expect(screen.getByText("Saved to My exercises")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText("Saved to My exercises")).not.toBeInTheDocument();
  });

  it("dismisses a plain toast after 2.6 seconds", () => {
    render(
      <ToastProvider>
        <ToastProbe message="Link copied" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
    expect(screen.getByText("Link copied")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
  });

  it("calls Undo once and removes the toast", () => {
    const onUndo = vi.fn();
    render(
      <ToastProvider>
        <ToastProbe message="Removed Example from My exercises" onUndo={onUndo} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onUndo).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("Removed Example from My exercises"),
    ).not.toBeInTheDocument();
  });
});
