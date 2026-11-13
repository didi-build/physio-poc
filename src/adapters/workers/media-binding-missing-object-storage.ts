import type {
  ObjectHeadResult,
  ObjectStoragePort,
  StoredObject,
} from "../../storage/ports/object-storage.js";
import { MediaStorageUnavailableError } from "../../storage/errors/media-storage-unavailable.js";

export {
  MEDIA_STORAGE_UNAVAILABLE_BODY,
  MEDIA_STORAGE_UNAVAILABLE_CODE,
  MediaStorageUnavailableError,
  isMediaStorageUnavailableError,
} from "../../storage/errors/media-storage-unavailable.js";

export const WORKER_MEDIA_BINDING_MISSING_LOG = "physio_worker_media_binding_missing";

let workerMediaBindingMissingLogged = false;

export function logWorkerMediaBindingMissingOnce(): void {
  if (!workerMediaBindingMissingLogged) {
    console.log(WORKER_MEDIA_BINDING_MISSING_LOG);
    workerMediaBindingMissingLogged = true;
  }
}

export function resetWorkerMediaBindingMissingLogForTests(): void {
  workerMediaBindingMissingLogged = false;
}

/** Fail-closed object storage when the production R2 binding is absent (media only). */
export class MediaBindingMissingObjectStorage implements ObjectStoragePort {
  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    void key;
    void body;
    void contentType;
    throw new MediaStorageUnavailableError();
  }

  async get(key: string): Promise<StoredObject | null> {
    void key;
    throw new MediaStorageUnavailableError();
  }

  async head(key: string): Promise<ObjectHeadResult | null> {
    void key;
    return null;
  }

  async delete(key: string): Promise<void> {
    void key;
    throw new MediaStorageUnavailableError();
  }
}

export function isMediaBindingMissingObjectStorage(
  port: ObjectStoragePort,
): port is MediaBindingMissingObjectStorage {
  return port instanceof MediaBindingMissingObjectStorage;
}
