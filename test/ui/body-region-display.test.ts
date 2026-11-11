import { describe, expect, it } from "vitest";
import { capitalizeBodyRegionLabel } from "../../src/ui/routines/body-region-display.js";

describe("capitalizeBodyRegionLabel", () => {
  it("capitalizes lowercase API labels", () => {
    expect(capitalizeBodyRegionLabel("knee")).toBe("Knee");
    expect(capitalizeBodyRegionLabel("hip")).toBe("Hip");
  });
});
