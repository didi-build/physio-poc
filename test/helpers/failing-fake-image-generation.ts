import { FakeImageGeneration } from "../../src/storage/adapters/memory/fake-image-generation.js";
import type { GenerateExerciseImagesInput } from "../../src/storage/ports/image-generation.js";
import { ImageGenerationError } from "../../src/storage/ports/image-generation.js";

export class FailingFakeImageGeneration extends FakeImageGeneration {
  constructor(private readonly fail: boolean) {
    super();
  }

  override async generateStartAndEndImages(
    input: GenerateExerciseImagesInput,
  ): Promise<{
    start: import("../../src/storage/ports/image-generation.js").GeneratedImage;
    end: import("../../src/storage/ports/image-generation.js").GeneratedImage;
  }> {
    if (this.fail) {
      throw new ImageGenerationError("image_generation_request_failed", 502);
    }
    return super.generateStartAndEndImages(input);
  }
}

/** Initial draft generation uses separate start/end calls, not generateStartAndEndImages. */
export class FailingInitialDraftImageGeneration extends FailingFakeImageGeneration {
  constructor(fail = true) {
    super(fail);
  }

  override async generateStartImage(
    startPrompt: string,
  ): Promise<import("../../src/storage/ports/image-generation.js").GeneratedImage> {
    void startPrompt;
    throw new ImageGenerationError("image_generation_request_failed", 502);
  }
}
