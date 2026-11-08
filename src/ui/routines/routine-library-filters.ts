import type { RoutineSearchSort } from "../../services/routines/types.js";
import {
  ALL_CONDITIONS,
  ALL_REGIONS,
  SORT_A_TO_Z,
  SORT_MOST_USED,
  SORT_NEWEST,
} from "../copy/routines.js";

export type RoutinesTab = "mine" | "all";

export type RoutineLibraryFilters = {
  bodyRegion: string | null;
  conditionId: string | null;
  sort: RoutineSearchSort;
};

export const DEFAULT_ROUTINE_FILTERS: RoutineLibraryFilters = {
  bodyRegion: null,
  conditionId: null,
  sort: "most_used",
};

export const ROUTINE_BODY_REGION_PILLS = [
  { label: ALL_REGIONS, value: null as string | null },
  { label: "Knee", value: "knee" },
  { label: "Hip", value: "hip" },
  { label: "Ankle", value: "ankle" },
  { label: "Shoulder", value: "shoulder" },
  { label: "Lower back", value: "lower back" },
  { label: "Neck", value: "neck" },
] as const;

export function routineFiltersToApiParams(filters: RoutineLibraryFilters): {
  body_region?: string;
  condition_id?: string;
  sort: RoutineSearchSort;
} {
  return {
    body_region: filters.bodyRegion ?? undefined,
    condition_id: filters.conditionId ?? undefined,
    sort: filters.sort,
  };
}

export function countRoutineActiveFilters(
  filters: RoutineLibraryFilters,
  conditionsAvailable: boolean,
): number {
  let count = 0;
  if (filters.bodyRegion) {
    count += 1;
  }
  if (conditionsAvailable && filters.conditionId) {
    count += 1;
  }
  if (filters.sort !== "most_used") {
    count += 1;
  }
  return count;
}

export function routineFilterSummary(
  filters: RoutineLibraryFilters,
  conditionsAvailable: boolean,
  conditionLabels: ReadonlyMap<string, string>,
): string {
  const regionLabel =
    filters.bodyRegion === null
      ? ALL_REGIONS
      : (ROUTINE_BODY_REGION_PILLS.find((pill) => pill.value === filters.bodyRegion)
          ?.label ?? filters.bodyRegion);
  const conditionLabel =
    !conditionsAvailable || filters.conditionId === null
      ? ALL_CONDITIONS
      : (conditionLabels.get(filters.conditionId) ?? ALL_CONDITIONS);
  const sortLabel =
    filters.sort === "most_used"
      ? SORT_MOST_USED
      : filters.sort === "newest"
        ? SORT_NEWEST
        : SORT_A_TO_Z;
  const parts = conditionsAvailable
    ? [conditionLabel, regionLabel, sortLabel]
    : [regionLabel, sortLabel];
  return parts.join(" · ");
}
