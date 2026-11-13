import { describe, expect, it } from "vitest";
import { exerciseVersionLacksStartOrEndImage } from "../src/domain/exercise-publish-media.js";

describe("exerciseVersionLacksStartOrEndImage", () => {
  it("treats null media_set_id as lacking", () => {
    expect(exerciseVersionLacksStartOrEndImage({ media_set_id: null })).toBe(true);
  });

  it("treats a missing media set row as lacking", () => {
    expect(exerciseVersionLacksStartOrEndImage({ media_set_id: "set-orphan" })).toBe(
      true,
    );
  });

  it("treats draft visibility as lacking", () => {
    expect(
      exerciseVersionLacksStartOrEndImage({
        media_set_id: "set-1",
        start_object_key: "a.png",
        end_object_key: "b.png",
        visibility: "draft",
      }),
    ).toBe(true);
  });

  it("treats empty keys as lacking", () => {
    expect(
      exerciseVersionLacksStartOrEndImage({
        media_set_id: "set-1",
        start_object_key: "  ",
        end_object_key: "b.png",
        visibility: "public",
      }),
    ).toBe(true);
  });

  it("allows public media with non-empty keys", () => {
    expect(
      exerciseVersionLacksStartOrEndImage({
        media_set_id: "set-1",
        start_object_key: "a.png",
        end_object_key: "b.png",
        visibility: "public",
      }),
    ).toBe(false);
  });
});
