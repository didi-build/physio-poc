import type {
  MediaStoragePort,
  MediaVisibility,
  StoredMediaObjectKeys,
} from "../../ports/media-storage.js";
import type { StoredObject } from "../../ports/object-storage.js";
import type { ObjectStoragePort } from "../../ports/object-storage.js";

function scopedKey(visibility: MediaVisibility, objectKey: string): string {
  return `${visibility}/${objectKey}`;
}

export class PrefixMediaStorage implements MediaStoragePort {
  constructor(private readonly objects: ObjectStoragePort) {}

  async putImage(
    objectKey: string,
    body: Uint8Array,
    contentType: string,
    visibility: MediaVisibility,
  ): Promise<void> {
    await this.objects.put(scopedKey(visibility, objectKey), body, contentType);
  }

  async getImage(
    objectKey: string,
    visibility: MediaVisibility,
  ): Promise<StoredObject | null> {
    return this.objects.get(scopedKey(visibility, objectKey));
  }

  async getPublicImage(objectKey: string): Promise<StoredObject | null> {
    return this.objects.get(scopedKey("public", objectKey));
  }

  async promoteDraftToPublic(
    keys: StoredMediaObjectKeys,
  ): Promise<StoredMediaObjectKeys> {
    await this.copyObject(keys.startObjectKey, "draft", "public");
    await this.copyObject(keys.endObjectKey, "draft", "public");
    await this.deleteDraftSet(keys);
    return keys;
  }

  async deleteDraftSet(keys: StoredMediaObjectKeys): Promise<void> {
    await this.objects.delete(scopedKey("draft", keys.startObjectKey));
    await this.objects.delete(scopedKey("draft", keys.endObjectKey));
  }

  private async copyObject(
    objectKey: string,
    from: MediaVisibility,
    to: MediaVisibility,
  ): Promise<void> {
    const value = await this.objects.get(scopedKey(from, objectKey));
    if (!value) {
      throw new Error(`Missing ${from} object ${objectKey}`);
    }
    await this.objects.put(scopedKey(to, objectKey), value.body, value.contentType);
  }
}
