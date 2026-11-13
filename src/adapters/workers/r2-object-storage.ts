import type {
  ObjectHeadResult,
  ObjectStoragePort,
  StoredObject,
} from "../../storage/ports/object-storage.js";

export type PhysioR2HttpMetadata = {
  contentType?: string;
};

export type PhysioR2PutOptions = {
  httpMetadata?: PhysioR2HttpMetadata;
};

export type PhysioR2ObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type PhysioR2Object = {
  body: PhysioR2ObjectBody | null;
  httpMetadata?: PhysioR2HttpMetadata;
  size?: number;
};

/** Minimal R2 bucket binding surface used by the Workers entry. */
export type PhysioR2Bucket = {
  put(
    key: string,
    value: Uint8Array | ArrayBuffer,
    options?: PhysioR2PutOptions,
  ): Promise<unknown>;
  get(key: string): Promise<PhysioR2Object | null>;
  head(key: string): Promise<PhysioR2Object | null>;
  delete(key: string): Promise<void>;
};

const DEFAULT_OBJECT_CONTENT_TYPE = "application/octet-stream";

function readContentType(metadata: PhysioR2HttpMetadata | undefined): string {
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
    if (!object?.body) {
      return null;
    }
    const buffer = new Uint8Array(await object.body.arrayBuffer());
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
