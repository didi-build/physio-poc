import { describe, expect, it } from "vitest";
import { ALL_REGIONS, SORT_MOST_USED } from "../src/ui/copy/routines.js";
import {
  buildRoutineBodyRegionFilterPills,
  DEFAULT_ROUTINE_FILTERS,
  routineFilterSummary,
  routineFiltersToApiParams,
} from "../src/ui/routines/routine-library-filters.js";

const SEEDED_BODY_REGIONS = [
  { id: "br-ankle", label: "ankle" },
  { id: "br-hip", label: "hip" },
  { id: "br-knee", label: "knee" },
] as const;

describe("DIDI-1211 routine library body region filters", () => {
  it("builds pills from GET /api/me/body-regions shape and omits unseeded regions", () => {
    const pills = buildRoutineBodyRegionFilterPills([...SEEDED_BODY_REGIONS]);
    expect(pills).toEqual([
      { label: ALL_REGIONS, value: null },
      { label: "Ankle", value: "ankle" },
      { label: "Hip", value: "hip" },
      { label: "Knee", value: "knee" },
    ]);
    expect(pills.some((pill) => pill.value === "shoulder")).toBe(false);
    expect(pills.some((pill) => pill.value === "neck")).toBe(false);
    expect(pills.some((pill) => pill.label === "Shoulder")).toBe(false);
  });

  it("sends lowercase body_region to search unchanged", () => {
    const pills = buildRoutineBodyRegionFilterPills([...SEEDED_BODY_REGIONS]);
    const knee = pills.find((pill) => pill.label === "Knee");
    expect(knee?.value).toBe("knee");
    expect(
      routineFiltersToApiParams({ ...DEFAULT_ROUTINE_FILTERS, bodyRegion: "knee" }),
    ).toEqual({
      sort: "most_used",
      body_region: "knee",
    });
  });

  it("uses endpoint-backed pills in the collapsed filter summary", () => {
    const pills = buildRoutineBodyRegionFilterPills([...SEEDED_BODY_REGIONS]);
    const summary = routineFilterSummary(
      { ...DEFAULT_ROUTINE_FILTERS, bodyRegion: "hip" },
      false,
      new Map(),
      pills,
    );
    expect(summary).toBe(`Hip · ${SORT_MOST_USED}`);
  });
});
