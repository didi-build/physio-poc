import { FakeImageGeneration } from "../../storage/adapters/memory/fake-image-generation.js";
import type { ImageGenerationPort } from "../../storage/ports/image-generation.js";
import { FalFluxKleinImageGeneration } from "./fal-flux-klein-image-generation.js";

export type ImageGenerationEnv = {
  FAL_KEY?: string;
};

export type CreateImageGenerationPortOptions = {
  fetchImpl?: typeof fetch;
};

export function createImageGenerationPort(
  env: ImageGenerationEnv,
  options: CreateImageGenerationPortOptions = {},
): ImageGenerationPort {
  const apiKey = env.FAL_KEY?.trim();
  if (apiKey) {
    return new FalFluxKleinImageGeneration({
      apiKey,
      fetchImpl: options.fetchImpl,
    });
  }
  return new FakeImageGeneration();
}
