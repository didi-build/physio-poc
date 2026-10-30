/** fal FLUX.2 klein 4B endpoints for the five-exercise test (ADR 0006). */
export const FAL_T2I_URL = "https://fal.run/fal-ai/flux-2/klein/4b";
export const FAL_EDIT_URL = "https://fal.run/fal-ai/flux-2/klein/4b/edit";
export const FAL_T2I_MODEL_ID = "fal-ai/flux-2/klein/4b";
export const FAL_EDIT_MODEL_ID = "fal-ai/flux-2/klein/4b/edit";

export const FAL_STORE_IO_HEADER = "X-Fal-Store-IO";
/** Literal header value required on every fal HTTP call (generation and download). */
export const FAL_STORE_IO_VALUE = "0";

/** Hard cap on fal inference calls per workflow run (DIDI-1038). Pinned at 20. */
export const MAX_GENERATIONS_PER_RUN = 20 as const;

/** Maximum downloaded PNG size from fal.media (about 1 MP PNG plus headroom). */
export const FAL_IMAGE_DOWNLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** ~1 MP still size for the test pass. */
export const IMAGE_SIZE_1MP = { width: 1024, height: 1024 } as const;

/** fal list pricing per megapixel (accessed 2026-10-30 via model llms.txt). */
export const COST_USD_PER_MP_T2I = 0.005;
export const COST_USD_PER_MP_EDIT = 0.01;

export function megapixelsFromSize(width: number, height: number): number {
  return (width * height) / 1_000_000;
}
