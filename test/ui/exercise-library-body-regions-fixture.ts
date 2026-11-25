import { vi } from "vitest";
import type { RoutinesClient } from "../../src/ui/api/routines-client.js";

/** Pinned GET /api/me/body-regions list shape (labels stored lowercase, ordered by label). */
export const EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE = [
  { id: "br-ankle", label: "ankle" },
  { id: "br-hip", label: "hip" },
  { id: "br-knee", label: "knee" },
] as const;

export function stubRoutinesClientForExerciseLibrary(): RoutinesClient {
  return {
    listMeBodyRegions: vi
      .fn()
      .mockResolvedValue([...EXERCISE_LIBRARY_BODY_REGIONS_FIXTURE]),
  } as unknown as RoutinesClient;
}
