import type { StoredObject } from "./object-storage.js";

export type MediaVisibility = "draft" | "public";

export type StoredMediaObjectKeys = {
  startObjectKey: string;
  endObjectKey: string;
};

/**
 * Exercise media blobs keyed under draft or public prefixes.
 * Draft objects must not be served on public URLs until promoted.
 */
export interface MediaStoragePort {
  putImage(
    objectKey: string,
    body: Uint8Array,
    contentType: string,
    visibility: MediaVisibility,
  ): Promise<void>;

  /** Internal reads (services, authenticated routes). */
  getImage(
    objectKey: string,
    visibility: MediaVisibility,
  ): Promise<StoredObject | null>;

  /**
   * Public CDN or signed URL fetches. Returns null for draft visibility or missing keys.
   */
  getPublicImage(objectKey: string): Promise<StoredObject | null>;

  promoteDraftToPublic(keys: StoredMediaObjectKeys): Promise<StoredMediaObjectKeys>;

  deleteDraftSet(keys: StoredMediaObjectKeys): Promise<void>;
}
