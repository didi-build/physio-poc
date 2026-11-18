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

export const DEEPINFRA_API_ORIGIN = "https://api.deepinfra.com";
export const DEEPINFRA_OPENAI_IMAGES_GENERATIONS_PATH = "/v1/openai/images/generations";
export const DEEPINFRA_IMAGES_EDITS_PATH = "/v1/images/edits";
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

function decodeBase64Image(b64: string): Uint8Array {
  if (typeof globalThis.atob !== "function") {
    throw new Error("base64 decode is unavailable");
  }
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function requestFailed(status: number): never {
  throw new ImageGenerationError("image_generation_request_failed", status);
}

function invalidResponse(): never {
  throw new ImageGenerationError("image_generation_response_invalid", 502);
}

function authorizationHeader(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function isEditUnsupportedResponse(status: number, bodyText: string): boolean {
  if (status === 422) {
    return true;
  }
  const lower = bodyText.toLowerCase();
  return (
    lower.includes("not supported") ||
    lower.includes("unsupported") ||
    lower.includes("does not support")
  );
}

async function readJsonBody(response: Response, maxBytes: number): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (Number.isFinite(len) && len > maxBytes) {
      invalidResponse();
    }
  }
  const text = await response.text();
  if (text.length > maxBytes) {
    invalidResponse();
  }
  if (text.trim().length === 0) {
    invalidResponse();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    invalidResponse();
  }
}

function imageFromPayload(payload: unknown): GeneratedImage {
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
    const end = await this.generateEndWithOptionalEdit(input.endPrompt, {
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
    return this.generateEndWithOptionalEdit(endPrompt, reference);
  }

  private requestSignal(): AbortSignal | undefined {
    if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
      return AbortSignal.timeout(this.requestTimeoutMs);
    }
    return undefined;
  }

  private async generateFromTextToImage(prompt: string): Promise<GeneratedImage> {
    const endpoint = `${DEEPINFRA_API_ORIGIN}${DEEPINFRA_OPENAI_IMAGES_GENERATIONS_PATH}`;
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        ...authorizationHeader(this.config.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.modelId,
        prompt,
        size: this.imageSize,
        n: 1,
        response_format: DEEPINFRA_IMAGE_RESPONSE_FORMAT,
      }),
      signal: this.requestSignal(),
    });
    if (!response.ok) {
      await response.text().catch(() => "");
      requestFailed(response.status);
    }
    const payload = await readJsonBody(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES);
    return imageFromPayload(payload);
  }

  private async generateFromEdit(
    prompt: string,
    reference: StartReferenceImage,
  ): Promise<GeneratedImage | "unsupported"> {
    const endpoint = `${DEEPINFRA_API_ORIGIN}${DEEPINFRA_IMAGES_EDITS_PATH}`;
    const form = new FormData();
    const imageBytes = new Uint8Array(reference.bytes);
    const blob = new Blob([imageBytes], { type: reference.contentType });
    form.append("image", blob, "start.png");
    form.append("prompt", prompt);
    form.append("model", this.modelId);
    form.append("size", this.imageSize);
    form.append("response_format", DEEPINFRA_IMAGE_RESPONSE_FORMAT);
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: authorizationHeader(this.config.apiKey),
      body: form,
      signal: this.requestSignal(),
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      if (isEditUnsupportedResponse(response.status, bodyText)) {
        return "unsupported";
      }
      requestFailed(response.status);
    }
    const payload = await readJsonBody(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES);
    return imageFromPayload(payload);
  }

  private async generateEndWithOptionalEdit(
    endPrompt: string,
    reference: StartReferenceImage,
  ): Promise<GeneratedImage> {
    const editResult = await this.generateFromEdit(endPrompt, reference);
    if (editResult !== "unsupported") {
      return editResult;
    }
    return this.generateFromTextToImage(endPrompt);
  }
}
