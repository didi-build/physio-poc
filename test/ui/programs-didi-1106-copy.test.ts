import { describe, expect, it } from "vitest";
import { TOAST_UNDO } from "../../src/ui/copy/nav.js";
import {
  TYPE_MISMATCH_BANNER_ONE,
  TYPE_MISMATCH_CARD_FLAG_ONE,
  TYPE_MISMATCH_DIDNT_LINK_BADGE,
  TYPE_MISMATCH_FIX,
  TYPE_MISMATCH_HINT_CONCENTRIC,
  TYPE_MISMATCH_HINT_ECCENTRIC,
  TYPE_MISMATCH_HINT_ISOMETRIC,
  TYPE_MISMATCH_PICK_ANOTHER_EXERCISE,
  TYPE_MISMATCH_REASON_STRENGTHENING_APPROVED,
  TYPE_MISMATCH_REASON_STRETCHING_APPROVED,
  TYPE_MISMATCH_SHOW_ME,
  TYPE_MISMATCH_UNDO,
  TYPE_MISMATCH_UNDO_LINK_FAILURE,
  typeMismatchBannerMany,
  typeMismatchCardFlag,
  typeMismatchCardFlagMany,
  typeMismatchLinkTypeAriaLabel,
  typeMismatchLinkedToast,
  TYPE_MISMATCH_PUBLISH_NOTICE_T18,
  TYPE_MISMATCH_PUBLISH_NOTICE_T19,
  typeMismatchPublishFixAriaLabel,
  typeMismatchRowTypeLine,
  typeMismatchShowMeAriaLabel,
} from "../../src/ui/copy/program-type-mismatch.js";

describe("DIDI-1106 program type-mismatch copy pins", () => {
  it("pins approved visible strings and accessibility labels", () => {
    expect(TYPE_MISMATCH_DIDNT_LINK_BADGE).toBe("Didn't link");
    expect(typeMismatchRowTypeLine("Stretching")).toBe("Row type: Stretching");
    expect(TYPE_MISMATCH_REASON_STRENGTHENING_APPROVED).toBe(
      "Approved as strengthening. Change the type to link it.",
    );
    expect(TYPE_MISMATCH_REASON_STRETCHING_APPROVED).toBe(
      "Approved as stretching. Change the type to link it.",
    );
    expect(TYPE_MISMATCH_FIX).toBe("Fix");
    expect(TYPE_MISMATCH_BANNER_ONE).toBe("1 exercise didn't link");
    expect(typeMismatchBannerMany(3)).toBe("3 exercises didn't link");
    expect(TYPE_MISMATCH_SHOW_ME).toBe("Show me");
    expect(TYPE_MISMATCH_HINT_ISOMETRIC).toBe("Hold still under load");
    expect(TYPE_MISMATCH_HINT_CONCENTRIC).toBe("Lift or push with control");
    expect(TYPE_MISMATCH_HINT_ECCENTRIC).toBe("Lower slowly");
    expect(TYPE_MISMATCH_PICK_ANOTHER_EXERCISE).toBe("Pick another exercise");
    expect(typeMismatchLinkedToast("Bridge marching", "Stretching")).toBe(
      "Linked Bridge marching as Stretching.",
    );
    expect(TYPE_MISMATCH_UNDO).toBe("Undo");
    expect(TYPE_MISMATCH_UNDO_LINK_FAILURE).toBe("Couldn't undo the link. Try again.");
    expect(TOAST_UNDO).toBe(TYPE_MISMATCH_UNDO);
    expect(TYPE_MISMATCH_CARD_FLAG_ONE).toBe("1 exercise didn't link");
    expect(typeMismatchCardFlag(0)).toBeNull();
    expect(typeMismatchCardFlag(1)).toBe(TYPE_MISMATCH_CARD_FLAG_ONE);
    expect(typeMismatchCardFlagMany(2)).toBe("2 exercises didn't link");
    expect(typeMismatchCardFlag(2)).toBe(typeMismatchCardFlagMany(2));
    expect(typeMismatchShowMeAriaLabel()).toBe("Show me exercises that didn't link");
    expect(typeMismatchLinkTypeAriaLabel("Bridge marching", "Stretching")).toBe(
      "Link Bridge marching as Stretching",
    );
    expect(typeMismatchPublishFixAriaLabel("Bridge marching")).toBe(
      "Fix for Bridge marching",
    );
    expect(TYPE_MISMATCH_PUBLISH_NOTICE_T18).toBe(
      "Fix or remove the exercises that didn't link.",
    );
    expect(TYPE_MISMATCH_PUBLISH_NOTICE_T19).toBe(
      "Fix or remove the exercises that didn't link, then publish.",
    );
  });
});
