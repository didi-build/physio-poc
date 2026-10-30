import { join } from "node:path";
import type { MediaTestLogger } from "./run-five-exercise-test.js";
import { redactFalSecrets } from "./redact.js";

export function resolveMediaTestOutputDir(
  cwd: string,
  mediaTestOutputDirEnv: string | undefined,
): string {
  const trimmed = mediaTestOutputDirEnv?.trim();
  return trimmed || join(cwd, "media-test-output");
}

export type MediaTestCliLoggerSinks = {
  log: (line: string) => void;
  error: (line: string) => void;
};

const defaultSinks: MediaTestCliLoggerSinks = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
};

/** Same redaction behavior as scripts/media-test/cli.ts. */
export function createMediaTestCliLogger(
  falKey: string,
  sinks: MediaTestCliLoggerSinks = defaultSinks,
): MediaTestLogger {
  return {
    info(message: string) {
      sinks.log(redactFalSecrets(message, falKey));
    },
    error(message: string) {
      sinks.error(redactFalSecrets(message, falKey));
    },
  };
}
