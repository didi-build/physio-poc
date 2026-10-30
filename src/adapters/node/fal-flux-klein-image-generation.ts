import type { ImageGenerationPort } from "../../storage/ports/image-generation.js";

export const FAL_FLUX_KLEIN_4B_MODEL_ID = "fal-ai/flux-2/klein/4b";

export const FAL_STORE_IO_HEADER = "X-Fal-Store-IO";
export const FAL_STORE_IO_DISABLED = "0";

export type FalFluxKleinImageGenerationConfig = {
  apiKey: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
};

type FalImageResponse = {
  images?: Array<{ url?: string }>;
};

function redactSecret(text: string, secret: string): string {
  if (!secret) {
    return text;
  }
  return text.split(secret).join("[REDACTED]");
}

function redactStringsFromPrompt(prompt: string): string[] {
  const marker = "Additional guidance from the practitioner: ";
  const idx = prompt.indexOf(marker);
  if (idx === -1) {
    return [];
  }
  const rest = prompt.slice(idx + marker.length);
  const end = rest.indexOf(".");
  const guidance = (end === -1 ? rest : rest.slice(0, end)).trim();
  return guidance.length > 0 ? [guidance] : [];
}

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
    return this.generateFromPrompt(startPrompt, redactStringsFromPrompt(startPrompt));
  }

  async generateEndImage(endPrompt: string): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }> {
    return this.generateFromPrompt(endPrompt, redactStringsFromPrompt(endPrompt));
  }

  private falRequestHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Key ${this.config.apiKey}`,
      [FAL_STORE_IO_HEADER]: FAL_STORE_IO_DISABLED,
    };
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }

  private sanitizeErrorDetail(detail: string, extraRedact: string[] = []): string {
    let out = redactSecret(detail, this.config.apiKey);
    for (const value of extraRedact) {
      out = redactSecret(out, value);
    }
    return out;
  }

  private async generateFromPrompt(
    prompt: string,
    redactInErrors: string[] = [],
  ): Promise<{
    bytes: Uint8Array;
    contentType: string;
  }> {
    const endpoint = `https://fal.run/${this.modelId}`;
    const response = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: this.falRequestHeaders("application/json"),
      body: JSON.stringify({
        prompt,
        output_format: "png",
        enable_safety_checker: true,
      }),
    });
    if (!response.ok) {
      const detail = this.sanitizeErrorDetail(await response.text(), redactInErrors);
      throw new Error(`fal image generation failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as FalImageResponse;
    const imageUrl = payload.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error("fal image generation returned no image URL");
    }
    const imageResponse = await this.fetchImpl(imageUrl, {
      method: "GET",
      headers: this.falRequestHeaders(),
    });
    if (!imageResponse.ok) {
      const detail = this.sanitizeErrorDetail(
        await imageResponse.text(),
        redactInErrors,
      );
      throw new Error(`fal image download failed (${imageResponse.status}): ${detail}`);
    }
    const contentType = imageResponse.headers.get("content-type") ?? "image/png";
    const buffer = await imageResponse.arrayBuffer();
    return { bytes: new Uint8Array(buffer), contentType };
  }
}
