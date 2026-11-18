import type { R2Bucket } from "@cloudflare/workers-types";
import type {
  ObjectHeadResult,
  ObjectStoragePort,
  StoredObject,
} from "../../storage/ports/object-storage.js";

export type PhysioR2Bucket = R2Bucket;

const DEFAULT_OBJECT_CONTENT_TYPE = "application/octet-stream";

function readContentType(metadata: { contentType?: string } | undefined): string {
  const contentType = metadata?.contentType?.trim();
  if (!contentType) {
    return DEFAULT_OBJECT_CONTENT_TYPE;
  }
  return contentType;
}

export class R2ObjectStorage implements ObjectStoragePort {
  constructor(private readonly bucket: PhysioR2Bucket) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType },
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    const object = await this.bucket.get(key);
    if (object === null) {
      return null;
    }
    const buffer = new Uint8Array(await object.arrayBuffer());
    return {
      body: buffer,
      contentType: readContentType(object.httpMetadata),
    };
  }

  async head(key: string): Promise<ObjectHeadResult | null> {
    const object = await this.bucket.head(key);
    if (!object) {
      return null;
    }
    const size = object.size;
    if (size === undefined || !Number.isFinite(size)) {
      return null;
    }
    return {
      contentType: readContentType(object.httpMetadata),
      size,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
