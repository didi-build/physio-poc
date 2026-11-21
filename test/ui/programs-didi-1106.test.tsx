/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgramBuilderRow } from "../../src/services/programs/types.js";
import type { ProgramListItem } from "../../src/services/programs/types.js";
import { ProgramBuilderRowCard } from "../../src/ui/programs/ProgramBuilderRowCard.js";
import { TypeMismatchBuilderBanner } from "../../src/ui/programs/TypeMismatchBuilderBanner.js";
import { PublishPlaceholderNotice } from "../../src/ui/programs/PublishPlaceholderNotice.js";
import { ProgramListCard } from "../../src/ui/programs/ProgramListCard.js";
import {
  TYPE_MISMATCH_BANNER_ONE,
  TYPE_MISMATCH_DIDNT_LINK_BADGE,
  TYPE_MISMATCH_FIX,
  TYPE_MISMATCH_REASON_STRENGTHENING_APPROVED,
  TYPE_MISMATCH_SHOW_ME,
} from "../../src/ui/copy/program-type-mismatch.js";
import { PENDING_REVIEW_BADGE } from "../../src/ui/copy/programs.js";

afterEach(() => {
  cleanup();
});

function mismatchRow(id: string, position: number, title: string): ProgramBuilderRow {
  return {
    id,
    position,
    kind: "placeholder",
    exercise_id: null,
    exercise_version_id: null,
    exercise_request_id: `req-${id}`,
    pinned_version_number: null,
    prescription_type: "stretching",
    params: { hold_s: 30, sets: 3, days_per_week: 3 },
    params_source: null,
    resolved_params: { hold_s: 30, sets: 3, days_per_week: 3 },
    resolved_params_source: "global_defaults",
    text_snapshot: { title },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    placeholder_state: "type_mismatch",
    type_mismatch_approved_category: "strengthening",
  };
}

describe("DIDI-1106 type-mismatch UI", () => {
  it("renders the builder banner with Show me at 390px layout class", async () => {
    const onShowMe = vi.fn();
    render(<TypeMismatchBuilderBanner count={1} onShowMe={onShowMe} />);
    expect(screen.getByRole("status")).toHaveTextContent(TYPE_MISMATCH_BANNER_ONE);
    await userEvent.click(
      screen.getByRole("button", { name: "Show me exercises that didn't link" }),
    );
    expect(onShowMe).toHaveBeenCalled();
    expect(screen.getByText(TYPE_MISMATCH_SHOW_ME)).toBeInTheDocument();
  });

  it("renders type_mismatch row copy, Fix expansion, and linked row without placeholder_state", async () => {
    const row = mismatchRow("row-1", 0, "Bridge marching");
    const onToggleFix = vi.fn();
    const onLink = vi.fn();
    const { rerender } = render(
      <ProgramBuilderRowCard
        row={row}
        index={0}
        total={1}
        noteDraft=""
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onDuplicate={() => {}}
        onRemove={() => {}}
        onNoteChange={() => {}}
        onTypeChange={() => {}}
        onSelectVersion={() => {}}
        onDoseAdjustOpen={() => {}}
        onDoseDraftChange={() => {}}
        onDoseAdjustClose={() => {}}
        onDoseDraftDiscard={() => {}}
        onParamsReset={() => {}}
        doseDraft={undefined}
        doseEditorOpen={false}
        fixPanelOpen={false}
        onToggleFix={onToggleFix}
        onLinkMismatchType={onLink}
      />,
    );
    const article = screen.getByRole("article", { name: /Bridge marching/i });
    expect(
      within(article).getByText(TYPE_MISMATCH_DIDNT_LINK_BADGE),
    ).toBeInTheDocument();
    expect(within(article).getByText("Row type: Stretching")).toBeInTheDocument();
    expect(
      within(article).getByText(TYPE_MISMATCH_REASON_STRENGTHENING_APPROVED),
    ).toBeInTheDocument();
    const fix = within(article).getByRole("button", { name: TYPE_MISMATCH_FIX });
    expect(fix).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(fix);
    expect(onToggleFix).toHaveBeenCalled();

    rerender(
      <ProgramBuilderRowCard
        row={row}
        index={0}
        total={1}
        noteDraft=""
        onMoveUp={() => {}}
        onMoveDown={() => {}}
        onDuplicate={() => {}}
        onRemove={() => {}}
        onNoteChange={() => {}}
        onTypeChange={() => {}}
        onSelectVersion={() => {}}
        onDoseAdjustOpen={() => {}}
        onDoseDraftChange={() => {}}
        onDoseAdjustClose={() => {}}
        onDoseDraftDiscard={() => {}}
        onParamsReset={() => {}}
        doseDraft={undefined}
        doseEditorOpen={false}
        fixPanelOpen
        onToggleFix={onToggleFix}
        onLinkMismatchType={onLink}
      />,
    );
    expect(fix).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(
      within(article).getByRole("button", {
        name: "Link Bridge marching as Isometric",
      }),
    );
    expect(onLink).toHaveBeenCalledWith("isometric");
  });

  it("lists publish placeholders in builder order with Fix and Pending review rows", () => {
    const placeholders = [
      {
        ...mismatchRow("a", 0, "Mismatch first"),
      },
      {
        ...mismatchRow("b", 1, "Awaiting second"),
        placeholder_state: "awaiting_approval" as const,
        type_mismatch_approved_category: undefined,
      },
    ];
    render(
      <MemoryRouter>
        <PublishPlaceholderNotice
          placeholders={placeholders}
          programCode="PRG-1234"
          showRepublishLine={false}
          publishedAt={null}
          onRemove={() => {}}
          onFixTypeMismatch={() => {}}
        />
      </MemoryRouter>,
    );
    const names = screen.getAllByText(/Mismatch first|Awaiting second/);
    expect(names[0]).toHaveTextContent("Mismatch first");
    expect(screen.getByText(TYPE_MISMATCH_DIDNT_LINK_BADGE)).toBeInTheDocument();
    expect(screen.getByText(PENDING_REVIEW_BADGE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Fix for Mismatch first" }),
    ).toHaveTextContent(TYPE_MISMATCH_FIX);
  });

  it("shows programs list card flag for type-mismatch count", () => {
    const item: ProgramListItem = {
      program_id: "p1",
      code: "PRG-55",
      name: "Program",
      exercise_count: 2,
      draft_updated_at: "2026-10-24T12:00:00.000Z",
      auto_save_status: { kind: "not_published_yet" },
      library_updates_to_review: 0,
      type_mismatch_placeholder_count: 2,
      share_link_status: "none",
      last_sent_at: null,
      deleted_at: null,
      routine_origin: null,
    };
    render(
      <MemoryRouter>
        <ProgramListCard item={item} matchedCode={null} />
      </MemoryRouter>,
    );
    expect(screen.getByText("2 exercises didn't link")).toBeInTheDocument();
  });
});
