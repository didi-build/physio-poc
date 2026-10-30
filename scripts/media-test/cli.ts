import { mkdirSync } from "node:fs";
import { runFiveExerciseMediaTest } from "./run-five-exercise-test.js";
import { createMediaTestCliLogger, resolveMediaTestOutputDir } from "./cli-support.js";

const falKey = process.env.FAL_KEY?.trim();
if (!falKey) {
  console.error("FAL_KEY is not set");
  process.exit(1);
}

const outputDir = resolveMediaTestOutputDir(
  process.cwd(),
  process.env.MEDIA_TEST_OUTPUT_DIR,
);

mkdirSync(outputDir, { recursive: true });

const logger = createMediaTestCliLogger(falKey);

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
