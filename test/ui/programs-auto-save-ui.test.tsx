/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_SAVE_FAILURE_HELPER,
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
  AUTO_SAVE_TRY_AGAIN,
  AUTO_SAVE_TRY_AGAIN_ARIA,
  NOT_PUBLISHED_YET,
} from "../../src/ui/copy/programs.js";
import { AutoSaveStatus } from "../../src/ui/programs/AutoSaveStatus.js";
import { BuilderPublishCard } from "../../src/ui/programs/BuilderPublishCard.js";
import { LeaveWithoutSavingSheet } from "../../src/ui/programs/LeaveWithoutSavingSheet.js";

describe("Programs auto-save UI (unit, jsdom)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders saving and saved copy", () => {
    const { rerender } = render(
      <AutoSaveStatus
        state="saving"
        failureAlertShown={false}
        failureMessage="Couldn't save the program. Try again."
        onTryAgain={() => {}}
      />,
    );
    expect(screen.getByText(AUTO_SAVE_SAVING)).toBeInTheDocument();
    rerender(
      <AutoSaveStatus
        state="saved"
        failureAlertShown={false}
        failureMessage="Couldn't save the program. Try again."
        onTryAgain={() => {}}
      />,
    );
    expect(screen.getByText(AUTO_SAVE_SAVED)).toBeInTheDocument();
  });

  it("renders failure alert copy once", () => {
    render(
      <AutoSaveStatus
        state="failed"
        failureAlertShown
        failureMessage="Couldn't save the program. Try again."
        onTryAgain={vi.fn()}
      />,
    );
    expect(screen.getByText(AUTO_SAVE_NOT_SAVED)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't save the program. Try again.",
    );
  });

  it("renders leave warning dialog", () => {
    render(
      <LeaveWithoutSavingSheet open onKeepEditing={() => {}} onLeave={() => {}} />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("announces publish card status from the visible status line, not a fixed Not published yet label", () => {
    const publishedAt = "2026-10-24T18:10:00.000Z";
    const previousTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const { container } = render(
        <BuilderPublishCard
          autoSaveStatus={{ kind: "published", published_at: publishedAt }}
          publishedAt={publishedAt}
          shareLinkStatus="open"
          saveUiState="saved"
          failureAlertShown={false}
          failureMessage="Couldn't save the program. Try again."
          publishAllowed={false}
          primaryLabel="Share link"
          pendingChanges={false}
          expiryLine={null}
          showLinkSettings
          onPrimary={() => {}}
          onLinkSettings={() => {}}
          onTryAgain={() => {}}
        />,
      );
      expect(screen.getByText(/Everything is live/)).toBeInTheDocument();
      const card = container.querySelector(".pg-publish-card");
      expect(card).not.toHaveAttribute("aria-label", NOT_PUBLISHED_YET);
    } finally {
      if (previousTz === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTz;
      }
    }
  });

  it("shows exactly one failure alert on the desktop publish card", () => {
    render(
      <BuilderPublishCard
        autoSaveStatus={{ kind: "not_published_yet" }}
        shareLinkStatus="none"
        saveUiState="failed"
        failureAlertShown
        failureMessage="Couldn't save the program. Try again."
        publishAllowed={false}
        primaryLabel="Publish"
        pendingChanges={false}
        expiryLine={null}
        showLinkSettings={false}
        onPrimary={() => {}}
        onLinkSettings={() => {}}
        onTryAgain={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("pins AUTO_SAVE_FAILURE_HELPER and retries without a duplicate failed-save alert on the card", async () => {
    expect(AUTO_SAVE_FAILURE_HELPER).toBe("Your latest changes aren't saved yet.");
    const onTryAgain = vi.fn();
    render(
      <AutoSaveStatus
        state="failed"
        failureAlertShown={false}
        failureMessage="Couldn't save the program. Try again."
        onTryAgain={onTryAgain}
      />,
    );
    expect(screen.getByText(AUTO_SAVE_FAILURE_HELPER)).toBeInTheDocument();
    expect(
      screen.queryByTestId("programs-autosave-failed-save-alert"),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: AUTO_SAVE_TRY_AGAIN_ARIA }),
    );
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(screen.getByText(AUTO_SAVE_TRY_AGAIN)).toBeInTheDocument();
  });

  it("shows exactly one failure alert on the phone status autosave block", () => {
    render(
      <AutoSaveStatus
        state="failed"
        failureAlertShown
        failureMessage="Couldn't save the program. Try again."
        onTryAgain={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
