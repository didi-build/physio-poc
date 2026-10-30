import type { ExerciseSearchSort } from "../../services/exercise-library/types.js";

export type LibraryTab = "mine" | "all";

export type TypeFilterChoice = "both" | "Stretching" | "Strengthening";

export type LibraryFilters = {
  bodyRegion: string | null;
  typeChoice: TypeFilterChoice;
  sort: ExerciseSearchSort;
};

export const DEFAULT_FILTERS: LibraryFilters = {
  bodyRegion: null,
  typeChoice: "both",
  sort: "most_used",
};

export const BODY_REGION_PILLS = [
  { label: "All regions", value: null as string | null },
  { label: "Knee", value: "knee" },
  { label: "Hip", value: "hip" },
  { label: "Ankle", value: "ankle" },
] as const;

export function filtersToApiParams(filters: LibraryFilters): {
  category?: "Stretching" | "Strengthening";
  body_region?: string;
  sort: ExerciseSearchSort;
} {
  return {
    category: filters.typeChoice === "both" ? undefined : filters.typeChoice,
    body_region: filters.bodyRegion ?? undefined,
    sort: filters.sort,
  };
}

export function countActiveFilters(filters: LibraryFilters): number {
  let count = 0;
  if (filters.bodyRegion) {
    count += 1;
  }
  if (filters.typeChoice !== "both") {
    count += 1;
  }
  if (filters.sort !== "most_used") {
    count += 1;
  }
  return count;
}

export function filterSummary(filters: LibraryFilters): string {
  const regionLabel =
    filters.bodyRegion === null
      ? "All regions"
      : (BODY_REGION_PILLS.find((p) => p.value === filters.bodyRegion)?.label ??
        filters.bodyRegion);
  const typeLabel =
    filters.typeChoice === "both" ? "Strengthening & stretching" : filters.typeChoice;
  const sortLabel =
    filters.sort === "most_used"
      ? "Most used"
      : filters.sort === "newest"
        ? "Newest"
        : "A to Z";
  return [regionLabel, typeLabel, sortLabel].join(" · ");
}

export function hasExactTitleMatch(query: string, names: readonly string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return names.some((name) => name.toLowerCase() === q);
}

export function formatListDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function parseSteps(steps: string): string[] {
  return steps
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
