import type { ExerciseRequestDraftView } from "./types.js";
import {
  logDraftGenerationFailed,
  type DraftGenerationFailurePhase,
} from "./draft-generation-failure-log.js";
import type { GenerateExerciseRequestDraftResult } from "./types.js";
import { DraftGenerationTerminalFailure } from "./draft-generation-terminal-failure.js";
import { UNEXPECTED_GENERATION_FAILURE_CODE } from "./draft-generation-failure-codes.js";

/** Shared HTTP-facing failure mapping for draft generation (DIDI-1279 extension point). */
export async function throwDraftGenerationFailure(
  error: unknown,
  phase: DraftGenerationFailurePhase,
  requestId: string,
  loadView: () => Promise<ExerciseRequestDraftView>,
): Promise<never> {
  logDraftGenerationFailed({ requestId, phase, error, httpStatus: 502 });
  if (phase === "text") {
    throw new DraftGenerationTerminalFailure({
      outcome: "text_failed",
      error: UNEXPECTED_GENERATION_FAILURE_CODE,
      view: null,
    });
  }
  const view = await loadView();
  throw new DraftGenerationTerminalFailure({ outcome: "images_failed", view });
}

/** @deprecated inline sync callers only */
export async function mapDraftGenerationFailureToResult(
  error: unknown,
  phase: DraftGenerationFailurePhase,
  requestId: string,
  loadView: () => Promise<ExerciseRequestDraftView>,
): Promise<GenerateExerciseRequestDraftResult> {
  try {
    await throwDraftGenerationFailure(error, phase, requestId, loadView);
  } catch (terminal) {
    if (terminal instanceof DraftGenerationTerminalFailure) {
      return terminal.terminal;
    }
    throw terminal;
  }
  throw new Error("unreachable");
}
