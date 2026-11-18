import { BodyRegionsRepository } from "../../storage/repositories/exercise-data.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";

export type ExerciseDraftBodyRegionPartition = {
  linkedRegionIds: string[];
  suggestedLabels: string[];
};

/** Match draft free-text names to library regions; unmatched names are kept as suggestions. */
export async function partitionExerciseDraftBodyRegions(
  sql: SqlStoragePort,
  rawNames: string[],
): Promise<ExerciseDraftBodyRegionPartition> {
  const regions = new BodyRegionsRepository(sql);
  const all = await regions.listAll();
  const byNormalizedLabel = new Map<string, { id: string; label: string }>();
  for (const row of all) {
    byNormalizedLabel.set(row.label.trim().toLowerCase(), row);
  }

  const linkedRegionIds: string[] = [];
  const suggestedLabels: string[] = [];
  const seenLinkedIds = new Set<string>();
  const seenSuggestedKeys = new Set<string>();

  for (const raw of rawNames) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const match = byNormalizedLabel.get(trimmed.toLowerCase());
    if (match) {
      if (!seenLinkedIds.has(match.id)) {
        seenLinkedIds.add(match.id);
        linkedRegionIds.push(match.id);
      }
      continue;
    }
    const suggestKey = trimmed.toLowerCase();
    if (!seenSuggestedKeys.has(suggestKey)) {
      seenSuggestedKeys.add(suggestKey);
      suggestedLabels.push(trimmed);
    }
  }

  return { linkedRegionIds, suggestedLabels };
}
