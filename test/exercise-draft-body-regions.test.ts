import { describe, expect, it } from "vitest";
import { partitionExerciseDraftBodyRegions } from "../src/adapters/deepinfra/exercise-draft-body-regions.js";
import { openMigratedDatabase } from "./helpers/exercise-sqlite-fixture.js";

describe("partitionExerciseDraftBodyRegions", () => {
  it("matches case-insensitively after trim and reuses the library region id", async () => {
    const storage = await openMigratedDatabase();
    try {
      const before = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      const result = await partitionExerciseDraftBodyRegions(storage, ["  KNEE  "]);
      expect(result.linkedRegionIds).toEqual(["br-knee"]);
      expect(result.suggestedLabels).toEqual([]);
      const after = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      expect(after?.count).toBe(before?.count);
    } finally {
      storage.close();
    }
  });

  it("dedupes case and whitespace variants into one normalized suggestion", async () => {
    const storage = await openMigratedDatabase();
    try {
      const result = await partitionExerciseDraftBodyRegions(storage, [
        "Upper back",
        "upper back",
        "upper   back",
      ]);
      expect(result.linkedRegionIds).toEqual([]);
      expect(result.suggestedLabels).toEqual(["upper back"]);
    } finally {
      storage.close();
    }
  });

  it("matches library labels after normalization instead of storing a suggestion", async () => {
    const storage = await openMigratedDatabase();
    try {
      const result = await partitionExerciseDraftBodyRegions(storage, [
        "  KNEE  ",
        "Knee",
      ]);
      expect(result.linkedRegionIds).toEqual(["br-knee"]);
      expect(result.suggestedLabels).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("keeps unmatched names as suggestions without creating body_regions rows", async () => {
    const storage = await openMigratedDatabase();
    try {
      const before = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      const result = await partitionExerciseDraftBodyRegions(storage, ["upper back"]);
      expect(result.linkedRegionIds).toEqual([]);
      expect(result.suggestedLabels).toEqual(["upper back"]);
      const after = await storage.first<{ count: number }>(
        "SELECT COUNT(*) AS count FROM body_regions",
      );
      expect(after?.count).toBe(before?.count);
    } finally {
      storage.close();
    }
  });
});
