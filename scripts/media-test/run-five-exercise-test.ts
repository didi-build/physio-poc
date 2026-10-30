import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  COST_USD_PER_MP_EDIT,
  COST_USD_PER_MP_T2I,
  FAL_EDIT_MODEL_ID,
  FAL_EDIT_URL,
  FAL_STORE_IO_HEADER,
  FAL_STORE_IO_VALUE,
  FAL_T2I_MODEL_ID,
  FAL_T2I_URL,
  IMAGE_SIZE_1MP,
  MAX_GENERATIONS_PER_RUN,
  megapixelsFromSize,
} from "./constants.js";
import { downloadFalImageBytes, type FetchLike } from "./download-fal-image.js";
import { FIVE_TEST_EXERCISES } from "./exercises.js";
import { buildExerciseImagePrompt, type ExerciseImagePhase } from "./prompts.js";
import { redactFalSecrets } from "./redact.js";

export type { FetchLike };

export interface MediaTestLogger {
  info(message: string): void;
  error(message: string): void;
}

export interface GenerationRecord {
  exerciseId: string;
  phase: ExerciseImagePhase;
  prompt: string;
  seed: number;
  endpoint: string;
  modelId: string;
  durationMs: number;
  estimatedCostUsd: number;
  imageFile: string;
}

export interface MediaTestManifest {
  generatedAt: string;
  textToImageEndpoint: string;
  editEndpoint: string;
  imageSize: { width: number; height: number };
  generations: GenerationRecord[];
  totalGenerations: number;
  totalEstimatedCostUsd: number;
  totalDurationMs: number;
}

export interface RunFiveExerciseMediaTestDeps {
  fetch: FetchLike;
  falKey: string;
  outputDir: string;
  logger?: MediaTestLogger;
  /** Defaults to guarded fal.media download via deps.fetch. */
  downloadBytes?: (url: string) => Promise<Uint8Array>;
}

interface FalImageResponse {
  images: { url: string }[];
  seed: number;
  prompt?: string;
}

export class GenerationCapError extends Error {
  constructor(cap: number) {
    super(`Generation cap exceeded (${cap} fal calls per run)`);
    this.name = "GenerationCapError";
  }
}

export function createGenerationCounter(cap: number = MAX_GENERATIONS_PER_RUN) {
  let count = 0;
  return {
    get count() {
      return count;
    },
    /** Call immediately before a fal generation fetch; throws without incrementing past cap. */
    tick(): number {
      if (count >= cap) {
        throw new GenerationCapError(cap);
      }
      count += 1;
      return count;
    },
  };
}

export function buildFalHeaders(falKey: string): Record<string, string> {
  return {
    Authorization: `Key ${falKey}`,
    "Content-Type": "application/json",
    [FAL_STORE_IO_HEADER]: FAL_STORE_IO_VALUE,
  };
}

export function safeLogMessage(message: string, falKey: string): string {
  return redactFalSecrets(message, falKey);
}

function safeFalError(message: string, falKey: string): Error {
  return new Error(safeLogMessage(message, falKey));
}

async function parseFalResponse(
  response: Response,
  falKey: string,
  logger: MediaTestLogger | undefined,
): Promise<FalImageResponse> {
  const bodyText = await response.text();
  if (!response.ok) {
    const detail = safeLogMessage(bodyText.slice(0, 500), falKey);
    logger?.error(`fal HTTP ${response.status}: ${detail}`);
    throw safeFalError(`fal request failed with status ${response.status}`, falKey);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    throw safeFalError("fal response was not JSON", falKey);
  }
  const data = parsed as FalImageResponse;
  if (!Array.isArray(data.images) || !data.images[0]?.url) {
    throw safeFalError("fal response missing images[0].url", falKey);
  }
  return data;
}

export async function callFalKleinEndpoint(
  deps: Pick<RunFiveExerciseMediaTestDeps, "fetch" | "falKey"> & {
    logger?: MediaTestLogger;
  },
  options: {
    url: string;
    modelId: string;
    body: Record<string, unknown>;
    generationCounter: ReturnType<typeof createGenerationCounter>;
  },
): Promise<{ data: FalImageResponse; durationMs: number }> {
  options.generationCounter.tick();
  const started = Date.now();
  const response = await deps.fetch(options.url, {
    method: "POST",
    headers: buildFalHeaders(deps.falKey),
    body: JSON.stringify(options.body),
  });
  const data = await parseFalResponse(response, deps.falKey, deps.logger);
  return { data, durationMs: Date.now() - started };
}

function estimateT2ICostUsd(): number {
  return (
    megapixelsFromSize(IMAGE_SIZE_1MP.width, IMAGE_SIZE_1MP.height) *
    COST_USD_PER_MP_T2I
  );
}

function estimateEditCostUsd(): number {
  return (
    megapixelsFromSize(IMAGE_SIZE_1MP.width, IMAGE_SIZE_1MP.height) *
    COST_USD_PER_MP_EDIT
  );
}

export async function runFiveExerciseMediaTest(
  deps: RunFiveExerciseMediaTestDeps,
): Promise<MediaTestManifest> {
  const logger = deps.logger;
  const downloadBytes =
    deps.downloadBytes ??
    ((url: string) => downloadFalImageBytes(deps.fetch, url, deps.falKey));

  const generationCounter = createGenerationCounter();
  const generations: GenerationRecord[] = [];

  for (const exercise of FIVE_TEST_EXERCISES) {
    const startPrompt = buildExerciseImagePrompt(exercise.nameSlug, "start");
    const startFile = `${exercise.id}-start.png`;

    const startCall = await callFalKleinEndpoint(deps, {
      url: FAL_T2I_URL,
      modelId: FAL_T2I_MODEL_ID,
      generationCounter,
      body: {
        prompt: startPrompt,
        image_size: IMAGE_SIZE_1MP,
        output_format: "png",
        num_images: 1,
      },
    });

    const startBytes = await downloadBytes(startCall.data.images[0].url);
    writeFileSync(join(deps.outputDir, startFile), startBytes);

    generations.push({
      exerciseId: exercise.id,
      phase: "start",
      prompt: startPrompt,
      seed: startCall.data.seed,
      endpoint: FAL_T2I_URL,
      modelId: FAL_T2I_MODEL_ID,
      durationMs: startCall.durationMs,
      estimatedCostUsd: estimateT2ICostUsd(),
      imageFile: startFile,
    });

    const endPrompt = buildExerciseImagePrompt(exercise.nameSlug, "end");
    const endFile = `${exercise.id}-end.png`;
    const startImageUrl = startCall.data.images[0].url;

    const endCall = await callFalKleinEndpoint(deps, {
      url: FAL_EDIT_URL,
      modelId: FAL_EDIT_MODEL_ID,
      generationCounter,
      body: {
        prompt: endPrompt,
        image_urls: [startImageUrl],
        image_size: IMAGE_SIZE_1MP,
        output_format: "png",
        num_images: 1,
      },
    });

    const endBytes = await downloadBytes(endCall.data.images[0].url);
    writeFileSync(join(deps.outputDir, endFile), endBytes);

    generations.push({
      exerciseId: exercise.id,
      phase: "end",
      prompt: endPrompt,
      seed: endCall.data.seed,
      endpoint: FAL_EDIT_URL,
      modelId: FAL_EDIT_MODEL_ID,
      durationMs: endCall.durationMs,
      estimatedCostUsd: estimateEditCostUsd(),
      imageFile: endFile,
    });

    logger?.info(
      safeLogMessage(
        `Completed ${exercise.id} (generations so far: ${generationCounter.count})`,
        deps.falKey,
      ),
    );
  }

  const manifest: MediaTestManifest = {
    generatedAt: new Date().toISOString(),
    textToImageEndpoint: FAL_T2I_URL,
    editEndpoint: FAL_EDIT_URL,
    imageSize: { ...IMAGE_SIZE_1MP },
    generations,
    totalGenerations: generationCounter.count,
    totalEstimatedCostUsd: generations.reduce((sum, g) => sum + g.estimatedCostUsd, 0),
    totalDurationMs: generations.reduce((sum, g) => sum + g.durationMs, 0),
  };

  writeFileSync(
    join(deps.outputDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  return manifest;
}
