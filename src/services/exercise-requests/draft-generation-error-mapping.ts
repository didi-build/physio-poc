import type { ExerciseRequestDraftView } from "./types.js";
import {
  logDraftGenerationFailed,
  type DraftGenerationFailurePhase,
} from "./draft-generation-failure-log.js";
import type { GenerateExerciseRequestDraftResult } from "./types.js";

/** Shared HTTP-facing failure mapping for draft generation (DIDI-1279 extension point). */
export async function mapDraftGenerationFailureToResult(
  error: unknown,
  phase: DraftGenerationFailurePhase,
  requestId: string,
  loadView: () => Promise<ExerciseRequestDraftView>,
): Promise<GenerateExerciseRequestDraftResult> {
  logDraftGenerationFailed({ requestId, phase, error, httpStatus: 502 });
  if (phase === "text") {
    return {
      outcome: "text_failed",
      error: "unexpected_generation_failure",
      view: null,
    };
  }
  const view = await loadView();
  return { outcome: "images_failed", view };
}
