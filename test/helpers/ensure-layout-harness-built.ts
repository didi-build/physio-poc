import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const DIST_DIR = join(process.cwd(), "dist");
const HARNESS_DIST = join(DIST_DIR, "exercise-requests-layout-harness");
const HARNESS_INDEX = join(HARNESS_DIST, "index.html");
const LOCK_DIR = join(DIST_DIR, ".layout-harness-build-lock");

const HARNESS_INPUTS = [
  join(process.cwd(), "vite.layout-harness.config.ts"),
  join(process.cwd(), "src/ui/styles/exercise-library.css"),
  join(process.cwd(), "src/ui/styles/programs.css"),
  join(process.cwd(), "src/ui/programs/ProgramSharePdfPreview.tsx"),
  join(process.cwd(), "src/ui/routines/RoutinesPage.tsx"),
  join(process.cwd(), "test/ui/harness/fixtures.ts"),
  join(process.cwd(), "test/ui/harness/programs-didi-1014-fixtures.ts"),
];

function harnessArtifactStale(): boolean {
  if (!existsSync(HARNESS_INDEX)) {
    return true;
  }
  const builtAt = statSync(HARNESS_INDEX).mtimeMs;
  return HARNESS_INPUTS.some(
    (path) => existsSync(path) && statSync(path).mtimeMs > builtAt,
  );
}

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
  if (existsSync(HARNESS_INDEX) && !harnessArtifactStale()) {
    return;
  }

  mkdirSync(DIST_DIR, { recursive: true });

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
      if (existsSync(HARNESS_INDEX) && !harnessArtifactStale()) {
        return;
      }
      sleepSync(50);
    }
  }

  if (existsSync(HARNESS_INDEX) && !harnessArtifactStale()) {
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
