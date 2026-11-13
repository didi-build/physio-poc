import type {
  ObjectHeadResult,
  ObjectStoragePort,
  StoredObject,
} from "../../storage/ports/object-storage.js";

/** Code-only JSON body for authenticated media when PHYSIO_MEDIA is absent (DIDI-1212 routes). */
export const MEDIA_STORAGE_UNAVAILABLE_BODY = '{"error":"media_storage_unavailable"}';

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
  }

  async get(key: string): Promise<StoredObject | null> {
    void key;
    return null;
  }

  async head(key: string): Promise<ObjectHeadResult | null> {
    void key;
    return null;
  }

  async delete(key: string): Promise<void> {
    void key;
  }
}

export function isMediaBindingMissingObjectStorage(
  port: ObjectStoragePort,
): port is MediaBindingMissingObjectStorage {
  return port instanceof MediaBindingMissingObjectStorage;
}
