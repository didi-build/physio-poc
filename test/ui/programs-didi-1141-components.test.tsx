/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUILT_FROM_SCRATCH,
  CARD_LINK_NO_LINK_YET,
  FILTER_ALL_PROGRAMS,
  FILTER_FROM_ROUTINE,
  FILTER_FROM_SCRATCH,
  LIBRARY_UPDATES_TO_REVIEW_SINGULAR,
  ROW_VERSION_LABEL,
  ROW_VERSION_PICKER_HINT,
  libraryUpdatesToReviewFlag,
  programCardOriginLineText,
  versionOfRowLabel,
} from "../../src/ui/copy/programs.js";
import { ProgramCardOriginLine } from "../../src/ui/programs/ProgramCardOriginLine.js";
import { ProgramCardSentAndLinkStatus } from "../../src/ui/programs/ProgramCardSentAndLinkStatus.js";
import {
  ProgramOriginFilterPills,
  type ProgramOriginFilter,
} from "../../src/ui/programs/ProgramOriginFilterPills.js";
import { ProgramRowVersionPicker } from "../../src/ui/programs/ProgramRowVersionPicker.js";

/** mockups/01-programs-list-phone.png (approved). */
const MOCKUP_01_COUNT_SENT = "6 exercises · Sent Oct 24";

/** mockups/29-programs-list-restored-phone.png uses the same library flag wording as 01. */
const MOCKUP_01_LIBRARY_FLAG = LIBRARY_UPDATES_TO_REVIEW_SINGULAR;

afterEach(() => {
  cleanup();
});

describe("DIDI-1141 program components (unit, jsdom)", () => {
  it("ProgramOriginFilterPills renders spec filter labels and reports selection", async () => {
    const onSelect = vi.fn<(filter: ProgramOriginFilter) => void>();
    render(<ProgramOriginFilterPills active="all" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: FILTER_ALL_PROGRAMS })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: FILTER_FROM_ROUTINE })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: FILTER_FROM_SCRATCH }));
    expect(onSelect).toHaveBeenCalledWith("from_scratch");
  });

  it("ProgramCardOriginLine renders scratch and routine origin copy from spec line 23", () => {
    const { rerender } = render(<ProgramCardOriginLine origin={null} />);
    expect(screen.getByText(BUILT_FROM_SCRATCH)).toBeInTheDocument();
    rerender(
      <ProgramCardOriginLine
        origin={{
          routine_id: "r1",
          routine_version_id: "v1",
          routine_version_number: 2,
          routine_name: "Knee rehab",
          used_as: "used_as_is",
        }}
      />,
    );
    expect(
      screen.getByText(
        programCardOriginLineText({
          routine_id: "r1",
          routine_version_id: "v1",
          routine_version_number: 2,
          routine_name: "Knee rehab",
          used_as: "used_as_is",
        }),
      ),
    ).toBeInTheDocument();
    rerender(
      <ProgramCardOriginLine
        origin={{
          routine_id: "r1",
          routine_version_id: "v1",
          routine_version_number: 2,
          routine_name: "Knee rehab",
          used_as: "tweaked",
        }}
      />,
    );
    expect(screen.getByText(/then tweaked$/)).toBeInTheDocument();
  });

  it("ProgramCardSentAndLinkStatus renders fixture lines verbatim", () => {
    render(
      <ProgramCardSentAndLinkStatus
        countAndSentLine={MOCKUP_01_COUNT_SENT}
        linkStatusLine={CARD_LINK_NO_LINK_YET}
      />,
    );
    expect(screen.getByText(MOCKUP_01_COUNT_SENT)).toBeInTheDocument();
    expect(screen.getByText(CARD_LINK_NO_LINK_YET)).toBeInTheDocument();
  });

  it("ProgramRowVersionPicker renders version copy and calls onSelectVersion", async () => {
    const onSelectVersion = vi.fn();
    render(
      <ProgramRowVersionPicker
        rowName="Heel raise"
        selectedVersionNumber={2}
        versionOptions={[1, 2, 3]}
        onSelectVersion={onSelectVersion}
      />,
    );
    expect(screen.getByText(versionOfRowLabel("Heel raise"))).toBeInTheDocument();
    expect(screen.getByText(ROW_VERSION_PICKER_HINT)).toBeInTheDocument();
    expect(screen.getByLabelText(ROW_VERSION_LABEL)).toHaveValue("2");
    await userEvent.selectOptions(screen.getByLabelText(ROW_VERSION_LABEL), "3");
    expect(onSelectVersion).toHaveBeenCalledWith(3);
  });
});

describe("libraryUpdatesToReviewFlag (unit, mockup copy)", () => {
  it("uses mockup 01/29 singular for count 1", () => {
    expect(libraryUpdatesToReviewFlag(1)).toBe(MOCKUP_01_LIBRARY_FLAG);
  });

  it("uses plural template for count 2+ (kills always-singular mutant)", () => {
    expect(libraryUpdatesToReviewFlag(2)).toBe("2 library updates to review");
  });

  it("does not pluralise count 1 (kills always-plural mutant)", () => {
    expect(libraryUpdatesToReviewFlag(1)).not.toBe("1 library updates to review");
  });
});
