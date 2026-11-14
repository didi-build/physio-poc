import type { R2Bucket, R2HTTPMetadata, R2PutOptions } from "@cloudflare/workers-types";

type StoredR2Object = {
  body: Uint8Array;
  contentType: string;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function buildR2ObjectBody(bytes: Uint8Array, httpMetadata: R2HTTPMetadata) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
  return {
    body: stream,
    arrayBuffer: async () => toArrayBuffer(bytes),
    text: async () => new TextDecoder().decode(bytes),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    blob: async () => new Blob([toArrayBuffer(bytes)]),
    httpMetadata,
    size: bytes.byteLength,
  };
}

function readPutContentType(options?: R2PutOptions): string {
  const httpMetadata = options?.httpMetadata;
  if (httpMetadata instanceof Headers) {
    const fromHeaders = httpMetadata.get("content-type");
    if (fromHeaders && fromHeaders.trim() !== "") {
      return fromHeaders.trim();
    }
    return "application/octet-stream";
  }
  const meta = httpMetadata as R2HTTPMetadata | undefined;
  if (meta?.contentType && meta.contentType.trim() !== "") {
    return meta.contentType.trim();
  }
  return "application/octet-stream";
}

export function createFakeR2Bucket(initial?: Map<string, StoredR2Object>): R2Bucket {
  const objects = new Map(initial);

  const bucket = {
    async head(key: string) {
      const stored = objects.get(key);
      if (!stored) {
        return null;
      }
      return buildR2ObjectBody(stored.body, {
        contentType: stored.contentType,
      }) as unknown as Awaited<ReturnType<R2Bucket["head"]>>;
    },

    async get(key: string) {
      const stored = objects.get(key);
      if (!stored) {
        return null;
      }
      return buildR2ObjectBody(stored.body, {
        contentType: stored.contentType,
      }) as unknown as Awaited<ReturnType<R2Bucket["get"]>>;
    },

    async put(
      key: string,
      value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
      options?: R2PutOptions,
    ) {
      let bytes: Uint8Array;
      if (value instanceof Uint8Array) {
        bytes = new Uint8Array(value);
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else if (typeof value === "string") {
        bytes = new TextEncoder().encode(value);
      } else if (value instanceof Blob) {
        bytes = new Uint8Array(await value.arrayBuffer());
      } else if (value && typeof value === "object" && "getReader" in value) {
        const reader = value.getReader();
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value: chunk } = await reader.read();
          if (done) {
            break;
          }
          if (chunk) {
            chunks.push(chunk);
          }
        }
        const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
      } else {
        bytes = new Uint8Array(0);
      }
      const contentType = readPutContentType(options);
      objects.set(key, { body: bytes, contentType });
      return buildR2ObjectBody(bytes, { contentType }) as unknown as Awaited<
        ReturnType<R2Bucket["put"]>
      >;
    },

    async delete(key: string) {
      objects.delete(key);
    },

    async list() {
      return { objects: [], delimitedPrefixes: [], truncated: false };
    },

    async createMultipartUpload() {
      throw new Error("createMultipartUpload is not implemented in the fake R2 bucket");
    },

    resumeMultipartUpload() {
      throw new Error("resumeMultipartUpload is not implemented in the fake R2 bucket");
    },
  };

  return bucket as unknown as R2Bucket;
}
