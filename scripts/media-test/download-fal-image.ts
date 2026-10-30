import {
  FAL_IMAGE_DOWNLOAD_MAX_BYTES,
  FAL_STORE_IO_HEADER,
  FAL_STORE_IO_VALUE,
} from "./constants.js";
import { redactFalKey } from "./redact.js";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export const FAL_IMAGE_DOWNLOAD_ALLOWED_HOST_SUFFIX = ".fal.media";

export function isAllowedFalImageDownloadHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "fal.media" || host.endsWith(FAL_IMAGE_DOWNLOAD_ALLOWED_HOST_SUFFIX);
}

export function assertAllowedFalImageDownloadUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("fal image download URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("fal image download URL must use https");
  }
  if (url.username || url.password) {
    throw new Error("fal image download URL must not include userinfo");
  }
  if (url.port && url.port !== "443") {
    throw new Error("fal image download URL must use default https port");
  }
  if (!isAllowedFalImageDownloadHost(url.hostname)) {
    throw new Error("fal image download URL host is not allowed");
  }
  return url;
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function readBodyWithSizeCap(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (Number.isFinite(len) && len > FAL_IMAGE_DOWNLOAD_MAX_BYTES) {
      throw new Error("fal image download exceeds size limit");
    }
  }

  const body = response.body;
  if (!body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > FAL_IMAGE_DOWNLOAD_MAX_BYTES) {
      throw new Error("fal image download exceeds size limit");
    }
    return new Uint8Array(buffer);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > FAL_IMAGE_DOWNLOAD_MAX_BYTES) {
      throw new Error("fal image download exceeds size limit");
    }
    chunks.push(value);
  }
  return concatChunks(chunks, total);
}

function falImageDownloadHeaders(): Record<string, string> {
  return {
    [FAL_STORE_IO_HEADER]: FAL_STORE_IO_VALUE,
  };
}

function safeDownloadErrorMessage(message: string, falKey: string): string {
  return redactFalKey(message, falKey);
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function downloadFalImageBytes(
  fetchImpl: FetchLike,
  urlString: string,
  falKey: string,
): Promise<Uint8Array> {
  const initialUrl = assertAllowedFalImageDownloadUrl(urlString);
  let response = await fetchImpl(initialUrl.toString(), {
    method: "GET",
    headers: falImageDownloadHeaders(),
    redirect: "manual",
  });

  if (REDIRECT_STATUSES.has(response.status)) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("fal image download redirect missing Location");
    }
    const redirectUrl = assertAllowedFalImageDownloadUrl(
      new URL(location, initialUrl).toString(),
    );
    response = await fetchImpl(redirectUrl.toString(), {
      method: "GET",
      headers: falImageDownloadHeaders(),
      redirect: "manual",
    });
  }

  if (!response.ok) {
    const detail = safeDownloadErrorMessage(
      (await response.text()).slice(0, 500),
      falKey,
    );
    throw new Error(`fal image download failed (${response.status}): ${detail}`);
  }

  return readBodyWithSizeCap(response);
}
