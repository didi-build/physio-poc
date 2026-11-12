// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoutinePublishSheet } from "../../src/ui/routines/RoutinePublishSheet.js";
import { MISSING_IMAGES_BLOCK_HEADING } from "../../src/ui/copy/routines.js";
import type { RoutineExerciseRow } from "../../src/services/routines/types.js";

const row: RoutineExerciseRow = {
  position: 0,
  exercise_id: "ex-1",
  exercise_version_id: "ver-1",
  exercise_name: "Heel slide",
  prescription_type: "stretching",
  params: { hold_s: 30 },
  lacks_start_or_end_image: true,
};

describe("Routine publish sheet missing images DIDI-1193", () => {
  it("disables Publish now when a row lacks images", () => {
    render(
      <RoutinePublishSheet
        open
        name="Knee routine"
        bodyRegionLabel="Knee"
        conditionLabel={null}
        rows={[row]}
        publishBusy={false}
        onClose={() => {}}
        onPublish={() => {}}
        onNotYet={() => {}}
      />,
    );
    expect(
      screen.getByRole("heading", { name: MISSING_IMAGES_BLOCK_HEADING }),
    ).toBeTruthy();
    expect(screen.getByTestId("rt-publish-confirm")).toHaveProperty("disabled", true);
  });

  it("invokes remove handler from the missing-images notice", async () => {
    const onRemove = vi.fn();
    render(
      <RoutinePublishSheet
        open
        name="Knee routine"
        bodyRegionLabel="Knee"
        conditionLabel={null}
        rows={[row]}
        publishBusy={false}
        onClose={() => {}}
        onPublish={() => {}}
        onNotYet={() => {}}
        onRemoveMissingImagesRow={onRemove}
      />,
    );
    const removeButtons = screen.getAllByRole("button", { name: "Remove Heel slide" });
    await userEvent.click(removeButtons[removeButtons.length - 1]!);
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
