import { vi } from "vitest";
import type { RoutinesClient } from "../../src/ui/api/routines-client.js";

/** Pinned GET /api/me/body-regions list shape (labels stored lowercase, DB order by label). */
export const ROUTINES_LIBRARY_BODY_REGIONS_FIXTURE = [
  { id: "br-ankle", label: "ankle" },
  { id: "br-hip", label: "hip" },
  { id: "br-knee", label: "knee" },
] as const;

export function stubListMeBodyRegionsResolved() {
  return vi.fn().mockResolvedValue([...ROUTINES_LIBRARY_BODY_REGIONS_FIXTURE]);
}

/** Ensures partial mocks include listMeBodyRegions when RoutinesPage mounts. */
export function withRoutinesPageBodyRegionsStub(
  partial: RoutinesClient,
): RoutinesClient {
  if (typeof partial.listMeBodyRegions === "function") {
    return partial;
  }
  return {
    ...partial,
    listMeBodyRegions: stubListMeBodyRegionsResolved(),
  } as unknown as RoutinesClient;
}
