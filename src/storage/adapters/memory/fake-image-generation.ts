import type {
  GenerateExerciseImagesInput,
  GeneratedImage,
  ImageGenerationCallOptions,
  ImageGenerationPort,
} from "../../ports/image-generation.js";

function pngFromSeed(label: string, channel: number): GeneratedImage {
  const bytes = new Uint8Array(8);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  bytes[4] = channel;
  bytes[5] = label.length % 256;
  bytes[6] = (label.length >> 8) % 256;
  bytes[7] = 0x0a;
  return { bytes, contentType: "image/png" };
}

export class FakeImageGeneration implements ImageGenerationPort {
  async generateStartAndEndImages(
    input: GenerateExerciseImagesInput,
  ): Promise<{ start: GeneratedImage; end: GeneratedImage }> {
    const start = pngFromSeed(input.startPrompt, 1);
    return {
      start,
      end: pngFromSeed(input.endPrompt, 2),
    };
  }

  async generateStartImage(
    startPrompt: string,
    options?: ImageGenerationCallOptions,
  ): Promise<GeneratedImage> {
    void options;
    return pngFromSeed(startPrompt, 1);
  }

  async generateEndImage(
    endPrompt: string,
    options?: ImageGenerationCallOptions,
  ): Promise<GeneratedImage> {
    void options;
    return pngFromSeed(endPrompt, 2);
  }
}
