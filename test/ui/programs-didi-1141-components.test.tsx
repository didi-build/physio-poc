/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { libraryUpdatesToReviewFlag } from "../../src/ui/copy/programs.js";
import { ProgramCardOriginLine } from "../../src/ui/programs/ProgramCardOriginLine.js";
import { ProgramCardSentAndLinkStatus } from "../../src/ui/programs/ProgramCardSentAndLinkStatus.js";
import {
  ProgramOriginFilterPills,
  type ProgramOriginFilter,
} from "../../src/ui/programs/ProgramOriginFilterPills.js";
import { ProgramRowVersionPicker } from "../../src/ui/programs/ProgramRowVersionPicker.js";

/** Literal expected copy (design/app/programs/spec.md and mockups 01/29). Not imported from production. */
const SPEC_FILTER_ALL = "All";
const SPEC_FILTER_GROUP = "Show programs";
const SPEC_FILTER_FROM_ROUTINE = "From a routine";
const SPEC_FILTER_FROM_SCRATCH = "From scratch";
const SPEC_BUILT_FROM_SCRATCH = "Built from scratch";
const SPEC_ORIGIN_USED_AS_IS = "From routine Knee rehab, v2, used as is";
const SPEC_ORIGIN_THEN_TWEAKED = "From routine Knee rehab, v2, then tweaked";
const MOCKUP_01_COUNT_SENT = "6 exercises · Sent Oct 24";
const SPEC_NO_LINK_YET = "No link yet";
const SPEC_ROW_VERSION_OF = "Version of Heel raise";
const SPEC_ROW_VERSION_HINT = "Pick a version. You can switch it on the row later.";
const SPEC_ROW_VERSION_LABEL = "Version";
const MOCKUP_01_LIBRARY_FLAG_SINGULAR = "1 library update to review";
const MOCKUP_01_LIBRARY_FLAG_PLURAL_2 = "2 library updates to review";

const ROUTINE_FIXTURE = {
  routine_id: "internal-routine-id",
  routine_version_id: "internal-version-id",
  routine_version_number: 2,
  routine_name: "Knee rehab",
  used_as: "used_as_is" as const,
};

afterEach(() => {
  cleanup();
});

describe("ProgramOriginFilterPills (unit, literal spec copy)", () => {
  it("shows All, From a routine, and From scratch labels (mockups 01/29, spec line 23)", () => {
    render(<ProgramOriginFilterPills active="all" onSelect={() => {}} />);
    expect(screen.getByRole("group", { name: SPEC_FILTER_GROUP })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SPEC_FILTER_ALL })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SPEC_FILTER_FROM_ROUTINE }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: SPEC_FILTER_FROM_SCRATCH }),
    ).toBeInTheDocument();
  });

  it("selects from_routine when From a routine is clicked, not all", async () => {
    const onSelect = vi.fn<(filter: ProgramOriginFilter) => void>();
    render(<ProgramOriginFilterPills active="all" onSelect={onSelect} />);
    await userEvent.click(
      screen.getByRole("button", { name: SPEC_FILTER_FROM_ROUTINE }),
    );
    expect(onSelect).toHaveBeenCalledWith("from_routine");
    expect(onSelect).not.toHaveBeenCalledWith("all");
  });

  it("marks From scratch pressed when active is from_scratch", () => {
    render(<ProgramOriginFilterPills active="from_scratch" onSelect={() => {}} />);
    expect(
      screen.getByRole("button", { name: SPEC_FILTER_FROM_SCRATCH }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: SPEC_FILTER_ALL })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("ProgramCardOriginLine (unit, literal spec copy)", () => {
  it('renders "Built from scratch" when origin is null', () => {
    render(<ProgramCardOriginLine origin={null} />);
    expect(screen.getByText(SPEC_BUILT_FROM_SCRATCH)).toBeInTheDocument();
  });

  it("renders the used-as-is origin line with routine name and v2, not internal ids", () => {
    render(<ProgramCardOriginLine origin={ROUTINE_FIXTURE} />);
    expect(screen.getByText(SPEC_ORIGIN_USED_AS_IS)).toBeInTheDocument();
    expect(screen.getByText(/Knee rehab/)).toBeInTheDocument();
    expect(screen.getByText(/, v2,/)).toBeInTheDocument();
    expect(screen.queryByText(/internal-routine-id/)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal-version-id/)).not.toBeInTheDocument();
  });

  it('renders exact ", then tweaked" punctuation for tweaked origin', () => {
    render(
      <ProgramCardOriginLine
        origin={{
          ...ROUTINE_FIXTURE,
          used_as: "tweaked",
        }}
      />,
    );
    expect(screen.getByText(SPEC_ORIGIN_THEN_TWEAKED)).toBeInTheDocument();
    expect(screen.getByText(/, then tweaked$/)).toHaveTextContent(
      SPEC_ORIGIN_THEN_TWEAKED,
    );
  });
});

describe("ProgramCardSentAndLinkStatus (unit, literal mockup copy)", () => {
  it("renders count-and-sent before link status and shows No link yet", () => {
    render(
      <ProgramCardSentAndLinkStatus
        countAndSentLine={MOCKUP_01_COUNT_SENT}
        linkStatusLine={SPEC_NO_LINK_YET}
      />,
    );
    const sent = screen.getByText(MOCKUP_01_COUNT_SENT);
    const link = screen.getByText(SPEC_NO_LINK_YET);
    expect(
      sent.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("ProgramRowVersionPicker (unit, literal spec copy)", () => {
  it("shows Version of title, hint, and Version label", async () => {
    const onSelectVersion = vi.fn();
    render(
      <ProgramRowVersionPicker
        rowName="Heel raise"
        selectedVersionNumber={2}
        versionOptions={[1, 2, 3]}
        onSelectVersion={onSelectVersion}
      />,
    );
    expect(screen.getByText(SPEC_ROW_VERSION_OF)).toBeInTheDocument();
    expect(screen.getByText(SPEC_ROW_VERSION_HINT)).toBeInTheDocument();
    expect(screen.getByLabelText(SPEC_ROW_VERSION_LABEL)).toHaveValue("2");
    await userEvent.selectOptions(screen.getByLabelText(SPEC_ROW_VERSION_LABEL), "3");
    expect(onSelectVersion).toHaveBeenCalledWith(3);
  });
});

describe("libraryUpdatesToReviewFlag (unit, literal mockup copy)", () => {
  it("matches mockup 01/29 singular for count 1", () => {
    expect(libraryUpdatesToReviewFlag(1)).toBe(MOCKUP_01_LIBRARY_FLAG_SINGULAR);
  });

  it("uses plural for count 2 (kills always-singular mutant)", () => {
    expect(libraryUpdatesToReviewFlag(2)).toBe(MOCKUP_01_LIBRARY_FLAG_PLURAL_2);
  });

  it("does not pluralise count 1 (kills always-plural mutant)", () => {
    expect(libraryUpdatesToReviewFlag(1)).not.toBe("1 library updates to review");
  });
});
