import { FakeImageGeneration } from "../../src/storage/adapters/memory/fake-image-generation.js";
import type {
  GenerateExerciseImagesInput,
  ImageGenerationPort,
} from "../../src/storage/ports/image-generation.js";

/** Tracks split start/end upstream calls used by initial draft media generation. */
export function countingSplitImageGeneration(): {
  port: ImageGenerationPort;
  upstreamCalls: () => number;
} {
  const base = new FakeImageGeneration();
  let calls = 0;
  const bump = () => {
    calls += 1;
  };
  return {
    upstreamCalls: () => calls,
    port: {
      async generateStartAndEndImages(input: GenerateExerciseImagesInput) {
        bump();
        return base.generateStartAndEndImages(input);
      },
      async generateStartImage(startPrompt, options) {
        bump();
        return base.generateStartImage(startPrompt, options);
      },
      async generateEndImage(endPrompt, options) {
        bump();
        return base.generateEndImage(endPrompt, options);
      },
    },
  };
}
