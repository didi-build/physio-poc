export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: string;
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
};

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
