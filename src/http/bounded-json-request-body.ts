/** Max JSON request body for exercise media generate/regenerate POST (16 KiB). */
export const EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES = 16384;

export const EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE = "request_body_too_large";

function contentLengthHeader(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null || raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

async function readBodyBytesBounded(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const body = request.body;
  if (!body) {
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error(EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Rejects oversize JSON bodies before parse using Content-Length and a bounded read.
 * Returns parsed object, empty object for empty body, or an error code string.
 */
export async function readBoundedExerciseMediaJsonObject(
  request: Request,
  maxBytes: number = EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES,
): Promise<Record<string, unknown> | typeof EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE> {
  const contentLength = contentLengthHeader(request);
  if (contentLength !== null && contentLength > maxBytes) {
    return EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE;
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBodyBytesBounded(request, maxBytes);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE
    ) {
      return EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE;
    }
    throw error;
  }

  if (bytes.byteLength === 0) {
    return {};
  }
  const text = new TextDecoder().decode(bytes);
  if (text.trim().length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SyntaxError("invalid_json_object");
  }
  return parsed as Record<string, unknown>;
}
