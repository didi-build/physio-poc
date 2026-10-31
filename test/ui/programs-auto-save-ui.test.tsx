/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_SAVE_FAILURE_ALERT,
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
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
      <AutoSaveStatus state="saving" failureAlertShown={false} onTryAgain={() => {}} />,
    );
    expect(screen.getByText(AUTO_SAVE_SAVING)).toBeInTheDocument();
    rerender(
      <AutoSaveStatus state="saved" failureAlertShown={false} onTryAgain={() => {}} />,
    );
    expect(screen.getByText(AUTO_SAVE_SAVED)).toBeInTheDocument();
  });

  it("renders failure alert copy once", () => {
    render(<AutoSaveStatus state="failed" failureAlertShown onTryAgain={vi.fn()} />);
    expect(screen.getByText(AUTO_SAVE_NOT_SAVED)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(AUTO_SAVE_FAILURE_ALERT);
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
          saveUiState="saved"
          failureAlertShown={false}
          publishAllowed={false}
          onTryAgain={() => {}}
        />,
      );
      expect(screen.getByText("Published Oct 24, 11:10 AM")).toBeInTheDocument();
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
        saveUiState="failed"
        failureAlertShown
        publishAllowed={false}
        onTryAgain={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows exactly one failure alert on the phone status autosave block", () => {
    render(<AutoSaveStatus state="failed" failureAlertShown onTryAgain={vi.fn()} />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
