export type StoredObject = {
  body: Uint8Array;
  contentType: string;
};

/**
 * Opaque media blobs (exercise images, video). Keys must not encode patient information.
 */
export interface ObjectStoragePort {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}
