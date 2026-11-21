import {
  DEEPINFRA_EXERCISE_DRAFT_REQUEST_TIMEOUT_MS,
  DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES,
  DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL,
} from "./exercise-draft-ai-config.js";
import { deepInfraExerciseDraftError } from "./deepinfra-draft-error-factory.js";
import { DeepInfraExerciseDraftError } from "../../services/exercise-requests/deepinfra-exercise-draft-error.js";

export type DeepInfraChatMessage = {
  role: "system" | "user";
  content: string;
};

export type DeepInfraChatCompletionRequest = {
  model: string;
  messages: DeepInfraChatMessage[];
  response_format: unknown;
};

const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 402, 403, 404, 422, 429]);

export function isNonRetryableDeepInfraHttpStatus(status: number): boolean {
  return NON_RETRYABLE_HTTP_STATUSES.has(status);
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

export async function readHttpResponseTextWithByteCap(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (Number.isFinite(len) && len > maxBytes) {
      throw deepInfraExerciseDraftError("deepinfra_exercise_draft_response_too_large");
    }
  }

  const body = response.body;
  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch (err) {
      throw mapFetchFailureToError(err);
    }
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.length;
    if (total > maxBytes) {
      throw deepInfraExerciseDraftError("deepinfra_exercise_draft_response_too_large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(concatChunks(chunks, total));
}

function mapFetchFailureToError(cause: unknown): DeepInfraExerciseDraftError {
  if (cause instanceof DeepInfraExerciseDraftError) {
    return cause;
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  const lowered = message.toLowerCase();
  if (
    lowered.includes("aborted") ||
    lowered.includes("timeout") ||
    cause instanceof DOMException
  ) {
    return deepInfraExerciseDraftError("deepinfra_exercise_draft_timeout");
  }
  return deepInfraExerciseDraftError("deepinfra_exercise_draft_network_error");
}

export type DeepInfraChatCompletionClientConfig = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  responseMaxBytes?: number;
};

export type DeepInfraChatCompletionSuccess = {
  contentJson: string;
  httpStatus: number;
};

export class DeepInfraChatCompletionClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly responseMaxBytes: number;

  constructor(private readonly config: DeepInfraChatCompletionClientConfig) {
    if (!config.apiKey.trim()) {
      throw new Error("DeepInfraChatCompletionClient requires apiKey");
    }
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = config.timeoutMs ?? DEEPINFRA_EXERCISE_DRAFT_REQUEST_TIMEOUT_MS;
    this.responseMaxBytes =
      config.responseMaxBytes ?? DEEPINFRA_EXERCISE_DRAFT_RESPONSE_MAX_BYTES;
  }

  async complete(
    request: DeepInfraChatCompletionRequest,
  ): Promise<DeepInfraChatCompletionSuccess> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch (err) {
        throw mapFetchFailureToError(err);
      }

      let rawText: string;
      try {
        rawText = await readHttpResponseTextWithByteCap(
          response,
          this.responseMaxBytes,
        );
      } catch (err) {
        throw mapFetchFailureToError(err);
      }

      if (!response.ok) {
        throw deepInfraExerciseDraftError("deepinfra_exercise_draft_request_failed", {
          httpStatus: response.status,
        });
      }

      let envelope: {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      try {
        envelope = JSON.parse(rawText) as typeof envelope;
      } catch {
        throw deepInfraExerciseDraftError("deepinfra_exercise_draft_response_invalid");
      }
      const content = envelope.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw deepInfraExerciseDraftError("deepinfra_exercise_draft_response_invalid");
      }
      return { contentJson: content, httpStatus: response.status };
    } finally {
      clearTimeout(timeout);
    }
  }
}
