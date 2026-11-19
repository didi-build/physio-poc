import {
  normalizeConditionLabelKey,
  validateSuggestedBodyRegionLabel,
} from "../../domain/exercise-free-text.js";
import { BodyRegionsRepository } from "../../storage/repositories/exercise-data.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";

export type ExerciseDraftBodyRegionPartition = {
  linkedRegionIds: string[];
  suggestedLabels: string[];
};

/** Match draft free-text names to library regions; unmatched names are kept as suggestions (normalized). */
export async function partitionExerciseDraftBodyRegions(
  sql: SqlStoragePort,
  rawNames: string[],
): Promise<ExerciseDraftBodyRegionPartition> {
  const regions = new BodyRegionsRepository(sql);
  const all = await regions.listAll();
  const byNormalizedLabel = new Map<string, { id: string; label: string }>();
  for (const row of all) {
    byNormalizedLabel.set(normalizeConditionLabelKey(row.label), row);
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
    const nameKey = normalizeConditionLabelKey(trimmed);
    const libraryMatch = byNormalizedLabel.get(nameKey);
    if (libraryMatch) {
      if (!seenLinkedIds.has(libraryMatch.id)) {
        seenLinkedIds.add(libraryMatch.id);
        linkedRegionIds.push(libraryMatch.id);
      }
      continue;
    }
    const validated = validateSuggestedBodyRegionLabel(trimmed);
    const suggestKey = normalizeConditionLabelKey(validated);
    const lateLibraryMatch = byNormalizedLabel.get(suggestKey);
    if (lateLibraryMatch) {
      if (!seenLinkedIds.has(lateLibraryMatch.id)) {
        seenLinkedIds.add(lateLibraryMatch.id);
        linkedRegionIds.push(lateLibraryMatch.id);
      }
      continue;
    }
    if (!seenSuggestedKeys.has(suggestKey)) {
      seenSuggestedKeys.add(suggestKey);
      suggestedLabels.push(suggestKey);
    }
  }

  return { linkedRegionIds, suggestedLabels };
}
