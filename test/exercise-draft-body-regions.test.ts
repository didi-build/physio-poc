import { describe, expect, it } from "vitest";
import { partitionExerciseDraftBodyRegions } from "../src/adapters/deepinfra/exercise-draft-body-regions.js";
import { FreeTextValidationError } from "../src/domain/exercise-free-text.js";
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

  it("matches library rows when the stored label has extra internal whitespace", async () => {
    const storage = await openMigratedDatabase();
    try {
      await storage.run("INSERT INTO body_regions (id, label) VALUES (?, ?)", [
        "br-lower-spaced",
        "lower  back",
      ]);
      const result = await partitionExerciseDraftBodyRegions(storage, ["lower back"]);
      expect(result.linkedRegionIds).toEqual(["br-lower-spaced"]);
      expect(result.suggestedLabels).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("matches seeded library labels when input collapses internal whitespace", async () => {
    const storage = await openMigratedDatabase();
    try {
      await storage.run("INSERT INTO body_regions (id, label) VALUES (?, ?)", [
        "br-lower-back",
        "lower back",
      ]);
      const result = await partitionExerciseDraftBodyRegions(storage, [
        "lower  back",
        "Lower\tback",
      ]);
      expect(result.linkedRegionIds).toEqual(["br-lower-back"]);
      expect(result.suggestedLabels).toEqual([]);
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

  it("links library lower back when input has extreme internal whitespace", async () => {
    const storage = await openMigratedDatabase();
    try {
      await storage.run("INSERT INTO body_regions (id, label) VALUES (?, ?)", [
        "br-lower-back-qa",
        "lower back",
      ]);
      const spaced = `Lower${" ".repeat(80)}Back`;
      const result = await partitionExerciseDraftBodyRegions(storage, [spaced]);
      expect(result.linkedRegionIds).toEqual(["br-lower-back-qa"]);
      expect(result.suggestedLabels).toEqual([]);
    } finally {
      storage.close();
    }
  });

  it("rejects overlong suggested labels via partition validation", async () => {
    const storage = await openMigratedDatabase();
    try {
      const overlong = `x${"y".repeat(80)}`;
      await expect(
        partitionExerciseDraftBodyRegions(storage, [overlong]),
      ).rejects.toThrow(FreeTextValidationError);
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
