import { normalizeWebAppBaseUrl } from "../../app-routes.js";
import {
  exerciseMediaPublicImagePath,
  type ExerciseMediaPublicImagePhase,
} from "../../exercise-media-api-paths.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  ExerciseMediaSetsRepository,
  ExerciseVersionMediaRepository,
} from "../../storage/repositories/exercise-media.js";

export type PublicShareLinkRowMedia = {
  start_url: string;
  end_url: string;
};

export function buildPublicShareLinkRowMediaUrl(
  webAppBaseUrl: string,
  exerciseVersionId: string,
  phase: ExerciseMediaPublicImagePhase,
): string {
  return `${normalizeWebAppBaseUrl(webAppBaseUrl)}${exerciseMediaPublicImagePath(
    exerciseVersionId,
    phase,
  )}`;
}

export function buildPublicShareLinkRowMediaUrls(
  webAppBaseUrl: string,
  exerciseVersionId: string,
): PublicShareLinkRowMedia {
  return {
    start_url: buildPublicShareLinkRowMediaUrl(
      webAppBaseUrl,
      exerciseVersionId,
      "start",
    ),
    end_url: buildPublicShareLinkRowMediaUrl(webAppBaseUrl, exerciseVersionId, "end"),
  };
}

/**
 * Resolves public media URLs for the exercise version pinned on the published snapshot row.
 * Returns null when the pinned version has no public media (failsafe / missing-media row).
 */
export async function resolvePublicShareLinkRowMedia(
  sql: SqlStoragePort,
  webAppBaseUrl: string,
  exerciseVersionId: string,
): Promise<PublicShareLinkRowMedia | null> {
  const versions = new ExerciseVersionMediaRepository(sql);
  const mediaSets = new ExerciseMediaSetsRepository(sql);
  const version = await versions.findVersion(exerciseVersionId);
  if (!version || version.status !== "approved" || !version.media_set_id) {
    return null;
  }
  const set = await mediaSets.findById(version.media_set_id);
  if (!set || set.visibility !== "public") {
    return null;
  }
  return buildPublicShareLinkRowMediaUrls(webAppBaseUrl, exerciseVersionId);
}
