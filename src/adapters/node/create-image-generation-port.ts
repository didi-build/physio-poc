import { FakeImageGeneration } from "../../storage/adapters/memory/fake-image-generation.js";
import type { ImageGenerationPort } from "../../storage/ports/image-generation.js";
import { DeepInfraFluxKleinImageGeneration } from "./deepinfra-flux-klein-image-generation.js";

export type ImageGenerationEnv = {
  PHYSIO_DEEPINFRA_API_KEY?: string;
};

export type CreateImageGenerationPortOptions = {
  fetchImpl?: typeof fetch;
};

export function createImageGenerationPort(
  env: ImageGenerationEnv,
  options: CreateImageGenerationPortOptions = {},
): ImageGenerationPort {
  const apiKey = env.PHYSIO_DEEPINFRA_API_KEY?.trim();
  if (apiKey) {
    return new DeepInfraFluxKleinImageGeneration({
      apiKey,
      fetchImpl: options.fetchImpl,
    });
  }
  return new FakeImageGeneration();
}
