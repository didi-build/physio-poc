/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "../../src/ui/components/Toast.js";
import { TYPE_MISMATCH_UNDO_LINK_FAILURE } from "../../src/ui/copy/program-type-mismatch.js";
import { TOAST_UNDO } from "../../src/ui/copy/nav.js";

afterEach(() => {
  cleanup();
});

function ShowFailedUndoToast() {
  const { showToast } = useToast();
  useEffect(() => {
    showToast({
      message: TYPE_MISMATCH_UNDO_LINK_FAILURE,
      variant: "alert",
      onUndo: () => {},
    });
  }, [showToast]);
  return null;
}

describe("DIDI-1106 failed undo toast accessibility", () => {
  it("pins alert role and failure copy on undo link errors", () => {
    render(
      <ToastProvider>
        <ShowFailedUndoToast />
      </ToastProvider>,
    );
    expect(screen.queryByRole("alert")).toHaveTextContent(
      TYPE_MISMATCH_UNDO_LINK_FAILURE,
    );
    expect(screen.queryByRole("button", { name: TOAST_UNDO })).toBeInTheDocument();
  });
});
