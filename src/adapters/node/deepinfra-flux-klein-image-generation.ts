import type {
  GeneratedImage,
  GenerateExerciseImagesInput,
  ImageGenerationCallOptions,
  ImageGenerationPort,
  StartReferenceImage,
} from "../../storage/ports/image-generation.js";
import { ImageGenerationError } from "../../storage/ports/image-generation.js";

export {
  ImageGenerationError,
  type ImageGenerationErrorCode,
} from "../../storage/ports/image-generation.js";

export const DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL =
  "https://api.deepinfra.com/v1/openai/images/generations";
export const DEEPINFRA_IMAGES_EDITS_URL = "https://api.deepinfra.com/v1/images/edits";
export const DEEPINFRA_FLUX_KLEIN_4B_MODEL_ID = "black-forest-labs/FLUX-2-klein-4b";
export const DEEPINFRA_FLUX_KLEIN_IMAGE_SIZE = "1024x1024";
export const DEEPINFRA_IMAGE_RESPONSE_FORMAT = "b64_json";
export const DEEPINFRA_GENERATED_CONTENT_TYPE = "image/png";

export const DEEPINFRA_IMAGE_REQUEST_TIMEOUT_MS = 120_000;
export const DEEPINFRA_IMAGE_JSON_MAX_BYTES = 12 * 1024 * 1024;

export type DeepInfraFluxKleinImageGenerationConfig = {
  apiKey: string;
  modelId?: string;
  imageSize?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type OpenAIImagesResponse = {
  data?: Array<{ b64_json?: string | null; url?: string | null }>;
};

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function decodeBase64Image(b64: string): Uint8Array {
  try {
    if (typeof globalThis.atob !== "function") {
      throw new Error("base64 decode is unavailable");
    }
    const binary = globalThis.atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    invalidResponse();
  }
}

function requestFailed(status: number): never {
  throw new ImageGenerationError("image_generation_request_failed", status);
}

function networkFailed(): never {
  throw new ImageGenerationError("image_generation_network_failed", 504);
}

function invalidResponse(): never {
  throw new ImageGenerationError("image_generation_response_invalid", 502);
}

function authorizationHeader(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  try {
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const len = Number(contentLength);
      if (Number.isFinite(len) && len > maxBytes) {
        invalidResponse();
      }
    }

    const body = response.body;
    if (!body) {
      invalidResponse();
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          invalidResponse();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return new TextDecoder().decode(concatChunks(chunks, total));
  } catch (error: unknown) {
    if (error instanceof ImageGenerationError) {
      throw error;
    }
    networkFailed();
  }
}

async function readJsonBody(response: Response, maxBytes: number): Promise<unknown> {
  const text = await readBoundedResponseText(response, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    invalidResponse();
  }
}

function imageFromPayload(payload: unknown): GeneratedImage {
  if (payload === null || typeof payload !== "object") {
    invalidResponse();
  }
  const parsed = payload as OpenAIImagesResponse;
  const entry = parsed.data?.[0];
  const b64 = entry?.b64_json;
  if (!b64 || typeof b64 !== "string") {
    invalidResponse();
  }
  return {
    bytes: decodeBase64Image(b64),
    contentType: DEEPINFRA_GENERATED_CONTENT_TYPE,
  };
}

export class DeepInfraFluxKleinImageGeneration implements ImageGenerationPort {
  private readonly modelId: string;
  private readonly imageSize: string;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: DeepInfraFluxKleinImageGenerationConfig) {
    if (!config.apiKey.trim()) {
      throw new Error("DeepInfraFluxKleinImageGeneration requires apiKey");
    }
    this.modelId = config.modelId ?? DEEPINFRA_FLUX_KLEIN_4B_MODEL_ID;
    this.imageSize = config.imageSize ?? DEEPINFRA_FLUX_KLEIN_IMAGE_SIZE;
    this.requestTimeoutMs =
      config.requestTimeoutMs ?? DEEPINFRA_IMAGE_REQUEST_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async generateStartAndEndImages(
    input: GenerateExerciseImagesInput,
  ): Promise<{ start: GeneratedImage; end: GeneratedImage }> {
    const start = await this.generateFromTextToImage(input.startPrompt);
    const end = await this.generateFromEdit(input.endPrompt, {
      bytes: start.bytes,
      contentType: start.contentType,
    });
    return { start, end };
  }

  async generateStartImage(
    startPrompt: string,
    options?: ImageGenerationCallOptions,
  ): Promise<GeneratedImage> {
    void options;
    return this.generateFromTextToImage(startPrompt);
  }

  async generateEndImage(
    endPrompt: string,
    options?: ImageGenerationCallOptions,
  ): Promise<GeneratedImage> {
    const reference = options?.startReferenceImage;
    if (!reference) {
      throw new ImageGenerationError("start_reference_required", 400);
    }
    return this.generateFromEdit(endPrompt, reference);
  }

  private requestSignal(): AbortSignal {
    return AbortSignal.timeout(this.requestTimeoutMs);
  }

  private async deepInfraFetch(input: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(input, init);
    } catch {
      networkFailed();
    }
  }

  private generationsRequestBody(prompt: string): string {
    return JSON.stringify({
      model: this.modelId,
      prompt,
      size: this.imageSize,
      n: 1,
      response_format: DEEPINFRA_IMAGE_RESPONSE_FORMAT,
    });
  }

  private async generateFromTextToImage(prompt: string): Promise<GeneratedImage> {
    const response = await this.deepInfraFetch(
      DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL,
      {
        method: "POST",
        headers: {
          ...authorizationHeader(this.config.apiKey),
          "Content-Type": "application/json",
        },
        body: this.generationsRequestBody(prompt),
        signal: this.requestSignal(),
      },
    );
    if (!response.ok) {
      await readBoundedResponseText(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES).catch(
        () => "",
      );
      requestFailed(response.status);
    }
    const payload = await readJsonBody(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES);
    return imageFromPayload(payload);
  }

  private async generateFromEdit(
    prompt: string,
    reference: StartReferenceImage,
  ): Promise<GeneratedImage> {
    const form = new FormData();
    const imageBytes = new Uint8Array(reference.bytes);
    const blob = new Blob([imageBytes], { type: reference.contentType });
    form.append("image", blob, "start.png");
    form.append("prompt", prompt);
    form.append("model", this.modelId);
    form.append("response_format", DEEPINFRA_IMAGE_RESPONSE_FORMAT);
    const response = await this.deepInfraFetch(DEEPINFRA_IMAGES_EDITS_URL, {
      method: "POST",
      headers: authorizationHeader(this.config.apiKey),
      body: form,
      signal: this.requestSignal(),
    });
    if (!response.ok) {
      await readBoundedResponseText(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES).catch(
        () => "",
      );
      requestFailed(response.status);
    }
    const payload = await readJsonBody(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES);
    return imageFromPayload(payload);
  }
}
