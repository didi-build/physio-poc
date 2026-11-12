// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PublishSheet } from "../../src/ui/programs/PublishSheet.js";
import { ProgramsApiError, ProgramsClient } from "../../src/ui/api/programs-client.js";
import { MISSING_IMAGES_BLOCK_HEADING } from "../../src/ui/copy/program-publish.js";
import type { ProgramBuilderView } from "../../src/services/programs/types.js";

function exerciseRow(id: string, lacksMedia: boolean) {
  return {
    id,
    position: 0,
    kind: "exercise" as const,
    exercise_id: "ex-1",
    exercise_version_id: "ver-1",
    exercise_request_id: null,
    pinned_version_number: 1,
    prescription_type: "stretching" as const,
    params: { hold_s: 30 },
    params_source: "global_defaults" as const,
    resolved_params: { hold_s: 30 },
    resolved_params_source: "global_defaults" as const,
    text_snapshot: { title: "Heel slide" },
    note: null,
    library_update: null,
    exercise_version_choices: [],
    lacks_start_or_end_image: lacksMedia,
  };
}

const baseProgram: ProgramBuilderView = {
  program_id: "prog-1",
  code: "AB12CD",
  name: "Program",
  created_at: "2026-01-01T00:00:00.000Z",
  draft_updated_at: "2026-01-01T00:00:00.000Z",
  auto_save_status: { kind: "not_published_yet" },
  draft_saved_at: "2026-01-01T00:00:00.000Z",
  exercise_count: 1,
  library_updates_to_review: 0,
  rows: [exerciseRow("row-1", true)],
  open_share_link: false,
  share_link_status: "none",
  last_sent_at: null,
  deleted_at: null,
  routine_origin: null,
};

describe("Publish sheet missing images DIDI-1193", () => {
  it("disables Publish now and shows advisory notice", () => {
    render(
      <PublishSheet
        open
        program={baseProgram}
        shareView={null}
        client={new ProgramsClient({ fetchFn: vi.fn() })}
        nameDraft="Program"
        showNameField
        onNameChange={() => {}}
        onProgramUpdated={() => {}}
        onClose={() => {}}
        onPublished={() => {}}
        onNotYet={() => {}}
        onRemovePlaceholder={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: MISSING_IMAGES_BLOCK_HEADING }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish now" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("invokes remove handler from the missing-images notice", async () => {
    const onRemove = vi.fn();
    render(
      <PublishSheet
        open
        program={baseProgram}
        shareView={null}
        client={new ProgramsClient({ fetchFn: vi.fn() })}
        nameDraft="Program"
        showNameField
        onNameChange={() => {}}
        onProgramUpdated={() => {}}
        onClose={() => {}}
        onPublished={() => {}}
        onNotYet={() => {}}
        onRemovePlaceholder={() => {}}
        onRemoveMissingImagesRow={onRemove}
      />,
    );
    const removeButtons = screen.getAllByRole("button", { name: "Remove Heel slide" });
    await userEvent.click(removeButtons[removeButtons.length - 1]!);
    expect(onRemove).toHaveBeenCalledWith("row-1");
  });

  it("keeps Publish now disabled when server returns missing_images_block_publish", async () => {
    const programWithMedia = {
      ...baseProgram,
      rows: [exerciseRow("row-1", false)],
    };
    const client = new ProgramsClient({ fetchFn: vi.fn() });
    vi.spyOn(client, "publishProgram").mockRejectedValue(
      new ProgramsApiError(
        "missing_images_block_publish",
        MISSING_IMAGES_BLOCK_HEADING,
      ),
    );
    vi.spyOn(client, "getProgramByCode").mockResolvedValue(programWithMedia);
    render(
      <PublishSheet
        open
        program={programWithMedia}
        shareView={null}
        client={client}
        nameDraft="Program"
        showNameField
        onNameChange={() => {}}
        onProgramUpdated={() => {}}
        onClose={() => {}}
        onPublished={() => {}}
        onNotYet={() => {}}
        onRemovePlaceholder={() => {}}
      />,
    );
    const publishNow = screen
      .getAllByRole("button", { name: "Publish now" })
      .find((button) => button.classList.contains("pg-btn--primary"));
    await userEvent.click(publishNow!);
    expect(
      await within(
        screen.getAllByTestId("publish-missing-images-notice")[0]!,
      ).findByRole("heading", { name: MISSING_IMAGES_BLOCK_HEADING }),
    ).toBeTruthy();
    expect(publishNow).toHaveProperty("disabled", true);
  });
});
