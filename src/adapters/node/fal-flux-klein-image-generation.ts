export const FAL_FLUX_KLEIN_4B_MODEL_ID = "fal-ai/flux-2/klein/4b";

export type FalFluxKleinImageGenerationConfig = {
  apiKey: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
};

type FalImageResponse = {
  images?: Array<{ url?: string }>;
};

import type { ImageGenerationPort } from "../../storage/ports/image-generation.js";

export class FalFluxKleinImageGeneration implements ImageGenerationPort {
  private readonly modelId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: FalFluxKleinImageGenerationConfig) {
    if (!config.apiKey.trim()) {
      throw new Error("FalFluxKleinImageGeneration requires apiKey");
    }
    this.modelId = config.modelId ?? FAL_FLUX_KLEIN_4B_MODEL_ID;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async generateStartAndEndImages(input: {
    startPrompt: string;
    endPrompt: string;
  }): Promise<{
    start: { bytes: Uint8Array; contentType: string };
    end: { bytes: Uint8Array; contentType: string };
  }> {
    const [start, end] = await Promise.all([
      this.generateStartImage(input.startPrompt),
      this.generateEndImage(input.endPrompt),
    ]);
    return { start, end };
  }

  async generateStartImage(startPrompt: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }> {
    return this.generateFromPrompt(startPrompt);
  }

  async generateEndImage(endPrompt: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }> {
    return this.generateFromPrompt(endPrompt);
  }

  private async generateFromPrompt(prompt: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }> {
    const response = await this.fetchImpl(`https://fal.run/${this.modelId}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        output_format: "png",
        enable_safety_checker: true,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`fal image generation failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as FalImageResponse;
    const imageUrl = payload.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error("fal image generation returned no image URL");
    }
    const imageResponse = await this.fetchImpl(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`fal image download failed (${imageResponse.status})`);
    }
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const buffer = await imageResponse.arrayBuffer();
    return { bytes: new Uint8Array(buffer), contentType };
  }
}
