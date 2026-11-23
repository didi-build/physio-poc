import {
  DEEPINFRA_IMAGES_EDITS_URL,
  DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL,
} from "../../src/adapters/node/deepinfra-flux-klein-image-generation.js";
import { DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL } from "../../src/adapters/deepinfra/exercise-draft-ai-config.js";

const STUB_DRAFT_JSON = {
  title: "Heel slide",
  aliases: ["Heel slides"],
  category: "stretch",
  body_regions: ["knee"],
  description: "Gentle knee flexion stretch.",
  equipment: "Mat",
  starting_position: "Supine on mat.",
  ending_position: "Knee bent with heel slid toward the hip.",
  steps: "1. Bend knee\n2. Slide heel",
  common_mistakes: "Rushing",
  regressions: "Smaller range",
  progressions: "Hold longer",
  precautions: "Stop if pain",
  cue_stretching: "Move slowly",
  cue_isometric: null,
  cue_concentric: null,
  cue_eccentric: null,
} as const;

function b64Png(label: string): string {
  return btoa(label);
}

export type Didi1289DeepInfraFetchCounts = {
  textChat: number;
  startImageGeneration: number;
  endImageEdit: number;
};

export function installDidi1289DeepInfraFetchStub(): {
  counts: Didi1289DeepInfraFetchCounts;
  restore: () => void;
} {
  const counts: Didi1289DeepInfraFetchCounts = {
    textChat: 0,
    startImageGeneration: 0,
    endImageEdit: 0,
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (
      url === DEEPINFRA_OPENAI_CHAT_COMPLETIONS_URL ||
      url.endsWith("/v1/openai/chat/completions")
    ) {
      counts.textChat += 1;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(STUB_DRAFT_JSON) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (
      url === DEEPINFRA_OPENAI_IMAGES_GENERATIONS_URL ||
      url.endsWith("/v1/openai/images/generations")
    ) {
      counts.startImageGeneration += 1;
      return new Response(
        JSON.stringify({
          data: [{ b64_json: b64Png(`start-${counts.startImageGeneration}`) }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url === DEEPINFRA_IMAGES_EDITS_URL || url.endsWith("/v1/images/edits")) {
      counts.endImageEdit += 1;
      return new Response(
        JSON.stringify({ data: [{ b64_json: b64Png(`end-${counts.endImageEdit}`) }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  };
  return {
    counts,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
