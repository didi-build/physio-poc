import { describe, expect, it } from "vitest";
import {
  ALL_REGIONS_FILTER_PILL,
  buildBodyRegionFilterPills,
  filterSummary,
  DEFAULT_FILTERS,
  type LibraryFilters,
} from "../src/ui/exercise-library/library-filters.js";

describe("DIDI-1206 exercise library body region filter pills", () => {
  const endpointRegions = [
    { id: "br-ankle", label: "ankle" },
    { id: "br-hip", label: "hip" },
    { id: "br-knee", label: "knee" },
  ] as const;

  it("builds pills from endpoint id/label with All regions first", () => {
    const pills = buildBodyRegionFilterPills(endpointRegions);
    expect(pills[0]).toEqual(ALL_REGIONS_FILTER_PILL);
    expect(pills).toEqual([
      { label: "All regions", value: null },
      { label: "Ankle", value: "ankle" },
      { label: "Hip", value: "hip" },
      { label: "Knee", value: "knee" },
    ]);
  });

  it("keeps search param as stored label, not id", () => {
    const pills = buildBodyRegionFilterPills(endpointRegions);
    const knee = pills.find((pill) => pill.label === "Knee");
    expect(knee?.value).toBe("knee");
    expect(knee?.value).not.toBe("br-knee");
  });

  it("filterSummary uses display label from pills", () => {
    const pills = buildBodyRegionFilterPills(endpointRegions);
    const active: LibraryFilters = {
      ...DEFAULT_FILTERS,
      bodyRegion: "hip",
    };
    expect(filterSummary(active, pills)).toBe(
      "Hip · Strengthening & stretching · Most used",
    );
  });

  it("filterSummary defaults to All regions", () => {
    const pills = buildBodyRegionFilterPills(endpointRegions);
    expect(filterSummary(DEFAULT_FILTERS, pills)).toBe(
      "All regions · Strengthening & stretching · Most used",
    );
  });
});
