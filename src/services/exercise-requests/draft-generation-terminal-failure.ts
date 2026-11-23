import type { GenerateExerciseRequestDraftResult } from "./types.js";

export type DraftGenerationTerminalOutcome = Exclude<
  GenerateExerciseRequestDraftResult["outcome"],
  "complete" | "in_progress"
>;

/** Thrown inside workflow steps when generation reaches a terminal failure (B2). */
export class DraftGenerationTerminalFailure extends Error {
  readonly name = "DraftGenerationTerminalFailure";

  constructor(
    readonly terminal: Extract<
      GenerateExerciseRequestDraftResult,
      { outcome: DraftGenerationTerminalOutcome }
    >,
  ) {
    super(terminal.outcome);
  }
}
