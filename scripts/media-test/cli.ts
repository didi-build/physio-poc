import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runFiveExerciseMediaTest } from "./run-five-exercise-test.js";
import { redactFalKey } from "./redact.js";

const falKey = process.env.FAL_KEY?.trim();
if (!falKey) {
  console.error("FAL_KEY is not set");
  process.exit(1);
}

const outputDir =
  process.env.MEDIA_TEST_OUTPUT_DIR?.trim() ?? join(process.cwd(), "media-test-output");

mkdirSync(outputDir, { recursive: true });

const logger = {
  info(message: string) {
    console.log(redactFalKey(message, falKey));
  },
  error(message: string) {
    console.error(redactFalKey(message, falKey));
  },
};

try {
  await runFiveExerciseMediaTest({
    fetch: globalThis.fetch.bind(globalThis),
    falKey,
    outputDir,
    logger,
  });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(message);
  process.exit(1);
}
