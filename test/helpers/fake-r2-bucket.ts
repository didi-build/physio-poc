import type {
  PhysioR2Bucket,
  PhysioR2Object,
  PhysioR2PutOptions,
} from "../../src/adapters/workers/r2-object-storage.js";

type StoredR2Object = {
  body: Uint8Array;
  contentType: string;
};

export function createFakeR2Bucket(
  initial?: Map<string, StoredR2Object>,
): PhysioR2Bucket {
  const objects = new Map(initial);

  return {
    async put(
      key: string,
      value: Uint8Array | ArrayBuffer,
      options?: PhysioR2PutOptions,
    ): Promise<void> {
      const bytes =
        value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
      const contentType =
        options?.httpMetadata?.contentType?.trim() ?? "application/octet-stream";
      objects.set(key, { body: bytes, contentType });
    },

    async get(key: string): Promise<PhysioR2Object | null> {
      const stored = objects.get(key);
      if (!stored) {
        return null;
      }
      const bodyCopy = new Uint8Array(stored.body);
      return {
        body: {
          arrayBuffer: async () =>
            bodyCopy.buffer.slice(
              bodyCopy.byteOffset,
              bodyCopy.byteOffset + bodyCopy.byteLength,
            ) as ArrayBuffer,
        },
        httpMetadata: { contentType: stored.contentType },
        size: stored.body.byteLength,
      };
    },

    async head(key: string): Promise<PhysioR2Object | null> {
      const stored = objects.get(key);
      if (!stored) {
        return null;
      }
      return {
        body: null,
        httpMetadata: { contentType: stored.contentType },
        size: stored.body.byteLength,
      };
    },

    async delete(key: string): Promise<void> {
      objects.delete(key);
    },
  };
}
