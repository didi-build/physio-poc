import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const UI_ROOT = join(import.meta.dirname, "../../src/ui");
const ALLOWED_RELATIVE = "api/exercise-library-client.ts";

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("UI API path guard", () => {
  it("does not hardcode /api/ outside the exercise library client module", () => {
    const violations: string[] = [];
    for (const file of listSourceFiles(UI_ROOT)) {
      const rel = relative(UI_ROOT, file);
      if (rel === ALLOWED_RELATIVE) {
        continue;
      }
      const content = readFileSync(file, "utf8");
      if (content.includes("/api/practitioners")) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});
