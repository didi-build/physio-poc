import type {
  ObjectHeadResult,
  ObjectStoragePort,
  StoredObject,
} from "../../storage/ports/object-storage.js";

export type S3CompatibleObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Minimal S3-compatible object storage for R2 or other S3 APIs.
 * Uses unsigned presigned-less REST calls via the AWS SDK fetch handler pattern.
 */
export class S3CompatibleObjectStorage implements ObjectStoragePort {
  private readonly fetchImpl: typeof fetch;
  private readonly region: string;

  constructor(private readonly config: S3CompatibleObjectStorageConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.region = config.region ?? "auto";
  }

  private redactErrorDetail(detail: string): string {
    return detail.split(this.config.secretAccessKey).join("[REDACTED]");
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const url = this.objectUrl(key);
    const response = await this.signedRequest("PUT", url, body, {
      "content-type": contentType,
    });
    if (!response.ok) {
      const detail = this.redactErrorDetail(await response.text());
      throw new Error(`S3 put failed (${response.status}): ${detail}`);
    }
  }

  async get(key: string): Promise<StoredObject | null> {
    const url = this.objectUrl(key);
    const response = await this.signedRequest("GET", url);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const detail = this.redactErrorDetail(await response.text());
      throw new Error(`S3 get failed (${response.status}): ${detail}`);
    }
    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await response.arrayBuffer();
    return { body: new Uint8Array(buffer), contentType };
  }

  async head(key: string): Promise<ObjectHeadResult | null> {
    const url = this.objectUrl(key);
    const response = await this.signedRequest("HEAD", url);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const detail = this.redactErrorDetail(await response.text());
      throw new Error(`S3 head failed (${response.status}): ${detail}`);
    }
    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const lengthHeader = response.headers.get("content-length");
    const size = lengthHeader ? Number.parseInt(lengthHeader, 10) : 0;
    return { contentType, size: Number.isFinite(size) ? size : 0 };
  }

  async delete(key: string): Promise<void> {
    const url = this.objectUrl(key);
    const response = await this.signedRequest("DELETE", url);
    if (response.status === 404) {
      return;
    }
    if (!response.ok) {
      const detail = this.redactErrorDetail(await response.text());
      throw new Error(`S3 delete failed (${response.status}): ${detail}`);
    }
  }

  private objectUrl(key: string): string {
    const base = this.config.endpoint.replace(/\/$/, "");
    return `${base}/${this.config.bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
  }

  private async signedRequest(
    method: string,
    url: string,
    body?: Uint8Array,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const headers = await signAwsRequest({
      method,
      url,
      region: this.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      body,
      extraHeaders,
    });
    return this.fetchImpl(url, {
      method,
      headers,
      body: body ? toArrayBuffer(body) : undefined,
    });
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

type SignInput = {
  method: string;
  url: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  body?: Uint8Array;
  extraHeaders: Record<string, string>;
};

async function signAwsRequest(input: SignInput): Promise<Record<string, string>> {
  const url = new URL(input.url);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(input.body ?? new Uint8Array());
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  for (const [name, value] of Object.entries(input.extraHeaders)) {
    headers[name.toLowerCase()] = value;
  }
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    input.method,
    url.pathname + url.search,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");
  const signingKey = await getSignatureKey(
    input.secretAccessKey,
    dateStamp,
    input.region,
    "s3",
  );
  const signature = await hmacHex(signingKey, stringToSign);
  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bufferToHex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const keyBytes = new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(signature);
}

async function hmacHex(key: Uint8Array, data: string): Promise<string> {
  return bufferToHex(await hmac(key, data));
}

async function getSignatureKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function bufferToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
