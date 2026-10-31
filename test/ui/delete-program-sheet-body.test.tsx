/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";
import { DeleteProgramSheetBody } from "../../src/ui/programs/DeleteProgramSheetBody.js";

function builderView(overrides: Partial<ProgramBuilderView> = {}): ProgramBuilderView {
  return {
    program_id: "prog-1",
    code: "PRG-TEST",
    name: "Knee program A",
    created_at: "2026-10-24T12:00:00.000Z",
    draft_updated_at: "2026-10-24T12:00:00.000Z",
    auto_save_status: { kind: "not_published_yet" },
    draft_saved_at: "2026-10-24T12:00:00.000Z",
    exercise_count: 2,
    library_updates_to_review: 0,
    rows: [],
    open_share_link: true,
    share_link_status: "open",
    last_sent_at: null,
    deleted_at: null,
    routine_origin: null,
    ...overrides,
  };
}

describe("DeleteProgramSheetBody (unit, jsdom)", () => {
  it("emphasizes Recently deleted and closes its share link in strong elements", () => {
    const { container } = render(
      <DeleteProgramSheetBody program={builderView({ open_share_link: true })} />,
    );
    const strongTexts = [...container.querySelectorAll("strong")].map(
      (el) => el.textContent,
    );
    expect(strongTexts).toContain("Recently deleted");
    expect(strongTexts).toContain("closes its share link");
  });

  it("does not emphasize closes its share link when the share link is already closed", () => {
    const { container } = render(
      <DeleteProgramSheetBody program={builderView({ open_share_link: false })} />,
    );
    const strongTexts = [...container.querySelectorAll("strong")].map(
      (el) => el.textContent,
    );
    expect(strongTexts).toContain("Recently deleted");
    expect(strongTexts).not.toContain("closes its share link");
    expect(
      within(container).getByText("Its share link is already closed."),
    ).toBeInTheDocument();
  });
});
