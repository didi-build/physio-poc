export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: string;
};

export type GenerateExerciseImagesInput = {
  startPrompt: string;
  endPrompt: string;
};

/**
 * Provider-neutral exercise still generation (start and end poses).
 * Production wiring uses FLUX.2 klein 4B on fal (DIDI-999); tests use a fake adapter.
 */
export interface ImageGenerationPort {
  generateStartAndEndImages(
    input: GenerateExerciseImagesInput,
  ): Promise<{ start: GeneratedImage; end: GeneratedImage }>;
  generateStartImage(startPrompt: string): Promise<GeneratedImage>;
  generateEndImage(endPrompt: string): Promise<GeneratedImage>;
}
