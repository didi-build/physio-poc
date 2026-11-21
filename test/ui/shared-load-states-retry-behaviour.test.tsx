/**
 * @vitest-environment jsdom
 *
 * Behavioural retry coverage for DIDI-1082 R4 (replaces grep-only guard).
 */
import "./setup.js";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRY_AGAIN,
  TRYING_AGAIN,
  failedSaveItem,
} from "../../src/ui/copy/shared-load-states.js";
import { SharedFailedSaveAlert } from "../../src/ui/shared-load-states/SharedLoadStates.js";

afterEach(() => {
  cleanup();
});

describe("DIDI-1082 retry behaviour (spec L34/L39)", () => {
  it("keeps failed-save alert mounted with Trying again... during async retry and refocuses alert on failure", async () => {
    let reject!: () => void;
    const onTryAgain = vi.fn(
      () =>
        new Promise<void>((_res, rej) => {
          reject = rej;
        }),
    );
    render(
      <SharedFailedSaveAlert
        message={failedSaveItem("program")}
        onTryAgain={onTryAgain}
        testId="retry-focus-alert"
      />,
    );
    const alert = screen.getByTestId("retry-focus-alert");
    await userEvent.click(screen.getByRole("button", { name: TRY_AGAIN }));
    expect(screen.getByRole("button", { name: TRYING_AGAIN })).toBeDisabled();
    expect(within(alert).getByText(failedSaveItem("program"))).toBeInTheDocument();
    reject();
    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  });
});
