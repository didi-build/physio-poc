/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AUTO_SAVE_FAILURE_ALERT,
  AUTO_SAVE_NOT_SAVED,
  AUTO_SAVE_SAVED,
  AUTO_SAVE_SAVING,
  NOT_PUBLISHED_YET,
  builderPublishedStatus,
} from "../../src/ui/copy/programs.js";
import { AutoSaveStatus } from "../../src/ui/programs/AutoSaveStatus.js";
import { BuilderPublishCard } from "../../src/ui/programs/BuilderPublishCard.js";
import { LeaveWithoutSavingSheet } from "../../src/ui/programs/LeaveWithoutSavingSheet.js";

describe("Programs auto-save UI (unit, jsdom)", () => {
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
    const publishedAt = "Oct 24, 3:15 PM";
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
    expect(screen.getByText(builderPublishedStatus(publishedAt))).toBeInTheDocument();
    const card = container.querySelector(".pg-publish-card");
    expect(card).not.toHaveAttribute("aria-label", NOT_PUBLISHED_YET);
  });
});
