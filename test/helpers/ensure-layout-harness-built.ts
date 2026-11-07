import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const HARNESS_DIST = join(process.cwd(), "dist/exercise-requests-layout-harness");
const HARNESS_INDEX = join(HARNESS_DIST, "index.html");
const LOCK_DIR = join(process.cwd(), "dist/.layout-harness-build-lock");

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait for cross-worker build coordination (tests only).
  }
}

/**
 * Builds the shared layout harness once per checkout even when Vitest runs browser
 * layout files in parallel workers.
 */
export function ensureLayoutHarnessBuilt(): void {
  if (existsSync(HARNESS_INDEX)) {
    return;
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      mkdirSync(LOCK_DIR);
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw error;
      }
      if (existsSync(HARNESS_INDEX)) {
        return;
      }
      sleepSync(50);
    }
  }

  if (existsSync(HARNESS_INDEX)) {
    return;
  }

  try {
    execSync("npx vite build --config vite.layout-harness.config.ts", {
      stdio: "inherit",
    });
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }

  if (!existsSync(HARNESS_INDEX)) {
    throw new Error("Layout harness build did not produce index.html");
  }
}
