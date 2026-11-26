import { vi } from "vitest";
import type { RoutinesClient } from "../../src/ui/api/routines-client.js";

/** Pinned GET /api/me/body-regions list shape (labels stored lowercase, ordered by label). */
export const EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE = [
  { id: "br-ankle", label: "ankle" },
  { id: "br-hip", label: "hip" },
  { id: "br-knee", label: "knee" },
] as const;

export const EXERCISE_LIBRARY_REGION_PILL_LABELS = [
  "All regions",
  "Ankle",
  "Hip",
  "Knee",
] as const;

export function stubRoutinesClientForExerciseLibrary(): RoutinesClient {
  return {
    listMeBodyRegions: vi
      .fn()
      .mockResolvedValue([...EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE]),
  } as unknown as RoutinesClient;
}

/** Ensures partial routines test doubles expose listMeBodyRegions for exercise library surfaces. */
export function withExerciseLibraryBodyRegions(client: RoutinesClient): RoutinesClient {
  if (typeof client.listMeBodyRegions === "function") {
    return client;
  }
  return {
    ...client,
    listMeBodyRegions: vi
      .fn()
      .mockResolvedValue([...EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE]),
  } as unknown as RoutinesClient;
}
