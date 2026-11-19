export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: string;
  /** fal CDN URL for the start image, when the provider returns one (for edit chaining). */
  providerSourceUrl?: string;
};

export type GenerateExerciseImagesInput = {
  startPrompt: string;
  endPrompt: string;
  regenerationNote?: string | null;
};

export type StartReferenceImage = {
  bytes: Uint8Array;
  contentType: string;
};

export type ImageGenerationCallOptions = {
  regenerationNote?: string | null;
  startReferenceImage?: StartReferenceImage;
  /** fal manual-test adapter: HTTPS URL on fal.media for edit chaining. */
  startReferenceImageUrl?: string;
};

export type FalImageGenerationErrorCode =
  | "fal_api_request_failed"
  | "fal_image_download_failed"
  | "fal_start_reference_required";

export class FalImageGenerationError extends Error {
  readonly code: FalImageGenerationErrorCode;
  readonly statusCode: number;

  constructor(code: FalImageGenerationErrorCode, statusCode: number) {
    super(code);
    this.name = "FalImageGenerationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type ImageGenerationErrorCode =
  | "image_generation_request_failed"
  | "image_generation_response_invalid"
  | "image_generation_network_failed"
  | "start_reference_required";

export class ImageGenerationError extends Error {
  readonly code: ImageGenerationErrorCode;
  readonly statusCode: number;

  constructor(code: ImageGenerationErrorCode, statusCode: number) {
    super(code);
    this.name = "ImageGenerationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Provider-neutral exercise still generation (start and end poses).
 * Production wiring uses FLUX.2 klein 4B on DeepInfra (DIDI-1209); tests use a fake adapter.
 */
export interface ImageGenerationPort {
  generateStartAndEndImages(
    input: GenerateExerciseImagesInput,
  ): Promise<{ start: GeneratedImage; end: GeneratedImage }>;
  generateStartImage(
    startPrompt: string,
    options?: ImageGenerationCallOptions,
  ): Promise<GeneratedImage>;
  generateEndImage(
    endPrompt: string,
    options?: ImageGenerationCallOptions,
  ): Promise<GeneratedImage>;
}
