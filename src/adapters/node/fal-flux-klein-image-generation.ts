import type { ImageGenerationPort } from "../../storage/ports/image-generation.js";

export const FAL_FLUX_KLEIN_4B_MODEL_ID = "fal-ai/flux-2/klein/4b";

export const FAL_STORE_IO_HEADER = "X-Fal-Store-IO";
export const FAL_STORE_IO_DISABLED = "0";

/**
 * fal image API returns HTTPS URLs on fal.media (for example
 * https://v3b.fal.media/files/...). Only that host and its subdomains are fetched.
 */
export const FAL_IMAGE_DOWNLOAD_ALLOWED_HOST_SUFFIX = ".fal.media";

/** Maximum downloaded image size (PNG from flux klein). */
export const FAL_IMAGE_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024;

export type FalFluxKleinImageGenerationConfig = {
  apiKey: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
};

type FalImageResponse = {
  images?: Array<{ url?: string }>;
};

export function isAllowedFalImageDownloadHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "fal.media" || host.endsWith(FAL_IMAGE_DOWNLOAD_ALLOWED_HOST_SUFFIX);
}

export function assertAllowedFalImageDownloadUrl(urlString: string): URL {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("fal image download URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("fal image download URL must use https");
  }
  if (!isAllowedFalImageDownloadHost(url.hostname)) {
    throw new Error("fal image download URL host is not allowed");
  }
  return url;
}

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

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
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

  private falApiRequestHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Key ${this.config.apiKey}`,
      [FAL_STORE_IO_HEADER]: FAL_STORE_IO_DISABLED,
    };
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }

  private falImageDownloadHeaders(): Record<string, string> {
    return {
      [FAL_STORE_IO_HEADER]: FAL_STORE_IO_DISABLED,
    };
  }

  private sanitizeErrorDetail(detail: string, extraRedact: string[] = []): string {
    let out = redactSecret(detail, this.config.apiKey);
    for (const value of extraRedact) {
      out = redactSecret(out, value);
    }
    return out;
  }

  private async readBodyWithSizeCap(response: Response): Promise<Uint8Array> {
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const len = Number(contentLength);
      if (Number.isFinite(len) && len > FAL_IMAGE_DOWNLOAD_MAX_BYTES) {
        throw new Error("fal image download exceeds size limit");
      }
    }

    const body = response.body;
    if (!body) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > FAL_IMAGE_DOWNLOAD_MAX_BYTES) {
        throw new Error("fal image download exceeds size limit");
      }
      return new Uint8Array(buffer);
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > FAL_IMAGE_DOWNLOAD_MAX_BYTES) {
        throw new Error("fal image download exceeds size limit");
      }
      chunks.push(value);
    }
    return concatChunks(chunks, total);
  }

  private async downloadFalImage(
    urlString: string,
    redactInErrors: string[],
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const initialUrl = assertAllowedFalImageDownloadUrl(urlString);
    let response = await this.fetchImpl(initialUrl.toString(), {
      method: "GET",
      headers: this.falImageDownloadHeaders(),
      redirect: "manual",
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("fal image download redirect missing Location");
      }
      const redirectUrl = assertAllowedFalImageDownloadUrl(
        new URL(location, initialUrl).toString(),
      );
      response = await this.fetchImpl(redirectUrl.toString(), {
        method: "GET",
        headers: this.falImageDownloadHeaders(),
        redirect: "manual",
      });
    }

    if (!response.ok) {
      const detail = this.sanitizeErrorDetail(await response.text(), redactInErrors);
      throw new Error(`fal image download failed (${response.status}): ${detail}`);
    }

    const contentType = response.headers.get("content-type") ?? "image/png";
    const bytes = await this.readBodyWithSizeCap(response);
    return { bytes, contentType };
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
      headers: this.falApiRequestHeaders("application/json"),
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
    return this.downloadFalImage(imageUrl, redactInErrors);
  }
}
