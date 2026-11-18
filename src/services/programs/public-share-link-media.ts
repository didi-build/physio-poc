import { isMediaStorageUnavailableError } from "../../storage/errors/media-storage-unavailable.js";
import { PrefixMediaStorage } from "../../storage/adapters/memory/prefix-media-storage.js";
import type { ObjectStoragePort } from "../../storage/ports/object-storage.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  ExerciseMediaSetsRepository,
  ExerciseVersionMediaRepository,
} from "../../storage/repositories/exercise-media.js";
import type { PublicShareLinkMediaPhase } from "../../programs-api-paths.js";
import { loadGatedPublicShareLinkContext } from "./public-share-link-gate.js";

export const PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY = '{"error":"not_found"}';

export const PUBLIC_SHARE_LINK_MEDIA_CACHE_CONTROL = "private, max-age=300";

const MEDIA_NOT_FOUND_HEADERS = {
  "content-type": "application/json",
  "cache-control": PUBLIC_SHARE_LINK_MEDIA_CACHE_CONTROL,
  "x-content-type-options": "nosniff",
} as const;

export function publicShareLinkMediaNotFoundResponse(): Response {
  return new Response(PUBLIC_SHARE_LINK_MEDIA_NOT_FOUND_BODY, {
    status: 404,
    headers: MEDIA_NOT_FOUND_HEADERS,
  });
}

async function resolveApprovedPublicMediaObjectKeys(
  sql: SqlStoragePort,
  exerciseVersionId: string,
): Promise<{ startObjectKey: string; endObjectKey: string } | null> {
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
  return {
    startObjectKey: set.start_object_key,
    endObjectKey: set.end_object_key,
  };
}

export async function resolvePublicShareLinkMediaObjectKey(
  sql: SqlStoragePort,
  token: string,
  exerciseVersionId: string,
  phase: PublicShareLinkMediaPhase,
  requestTime: Date = new Date(),
): Promise<string | null> {
  const context = await loadGatedPublicShareLinkContext(sql, token, requestTime);
  if (!context) {
    return null;
  }
  const pinnedOnSnapshot = context.snapshot.rows.some(
    (row) => row.exerciseVersionId === exerciseVersionId,
  );
  if (!pinnedOnSnapshot) {
    return null;
  }
  const keys = await resolveApprovedPublicMediaObjectKeys(sql, exerciseVersionId);
  if (!keys) {
    return null;
  }
  return phase === "start" ? keys.startObjectKey : keys.endObjectKey;
}

export async function servePublicShareLinkMediaBytes(
  sql: SqlStoragePort,
  objects: ObjectStoragePort,
  token: string,
  exerciseVersionId: string,
  phase: PublicShareLinkMediaPhase,
  requestTime: Date = new Date(),
): Promise<Response> {
  const objectKey = await resolvePublicShareLinkMediaObjectKey(
    sql,
    token,
    exerciseVersionId,
    phase,
    requestTime,
  );
  if (!objectKey) {
    return publicShareLinkMediaNotFoundResponse();
  }
  const storage = new PrefixMediaStorage(objects);
  let image;
  try {
    image = await storage.getPublicImage(objectKey);
  } catch (error) {
    if (isMediaStorageUnavailableError(error)) {
      return publicShareLinkMediaNotFoundResponse();
    }
    throw error;
  }
  if (!image) {
    return publicShareLinkMediaNotFoundResponse();
  }
  const bodyCopy = new Uint8Array(image.body);
  return new Response(bodyCopy, {
    status: 200,
    headers: {
      "content-type": image.contentType,
      "cache-control": PUBLIC_SHARE_LINK_MEDIA_CACHE_CONTROL,
      "x-content-type-options": "nosniff",
    },
  });
}
