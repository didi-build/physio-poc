/** Code-only JSON body for authenticated media when object storage is unavailable (DIDI-1212). */
export const MEDIA_STORAGE_UNAVAILABLE_BODY = '{"error":"media_storage_unavailable"}';

export const MEDIA_STORAGE_UNAVAILABLE_CODE = "media_storage_unavailable";

export class MediaStorageUnavailableError extends Error {
  readonly code = MEDIA_STORAGE_UNAVAILABLE_CODE;

  constructor() {
    super(MEDIA_STORAGE_UNAVAILABLE_CODE);
    this.name = "MediaStorageUnavailableError";
  }
}

export function isMediaStorageUnavailableError(
  error: unknown,
): error is MediaStorageUnavailableError {
  return error instanceof MediaStorageUnavailableError;
}
