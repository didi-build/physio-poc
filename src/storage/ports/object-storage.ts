export type StoredObject = {
  body: Uint8Array;
  contentType: string;
};

export type ObjectHeadResult = {
  contentType: string;
  size: number;
};

/**
 * Opaque media blobs (exercise images, video). Keys must not encode patient information.
 * Time-limited signed URLs are added with real R2 or S3 adapters in the bindings ticket.
 */
export interface ObjectStoragePort {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<ObjectHeadResult | null>;
  delete(key: string): Promise<void>;
}
