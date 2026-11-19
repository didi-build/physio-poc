import {
  createImageGenerationPort,
  type ImageGenerationEnv,
} from "../node/create-image-generation-port.js";
import type { ImageGenerationPort } from "../../storage/ports/image-generation.js";

/** Production Worker image port: DeepInfra when PHYSIO_DEEPINFRA_API_KEY is set, fake otherwise. */
export function createWorkerImageGenerationPort(
  env: ImageGenerationEnv,
): ImageGenerationPort {
  return createImageGenerationPort(env);
}
