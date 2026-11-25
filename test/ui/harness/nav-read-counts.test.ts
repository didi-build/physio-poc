/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import type { RoutinesClient } from "../../../src/ui/api/routines-client.js";
import {
  resetHarnessNavReadCounts,
  wrapRoutinesClientWithHarnessCounts,
} from "./nav-read-counts.js";

describe("harness nav read counts", () => {
  it("bumps routines.body_regions when listMeBodyRegions is called", async () => {
    resetHarnessNavReadCounts();
    const listMeBodyRegions = vi.fn().mockResolvedValue([]);
    const inner = { listMeBodyRegions } as unknown as RoutinesClient;
    const wrapped = wrapRoutinesClientWithHarnessCounts(inner);
    await wrapped.listMeBodyRegions();
    expect(listMeBodyRegions).toHaveBeenCalledTimes(1);
    expect(window.__harnessNavReadCounts?.["routines.body_regions"]).toBe(1);
  });
});
