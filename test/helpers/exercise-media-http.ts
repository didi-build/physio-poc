import type { AppRouteHandler } from "../../src/http/app.js";
import { handleExerciseMediaRequest } from "../../src/http/routes/exercise-media.js";

/** Test harness: exercise media routes (same handler as Node dev/test extraRouteHandlers). */
export function exerciseMediaExtraRouteHandlers(): AppRouteHandler[] {
  return [handleExerciseMediaRequest];
}
