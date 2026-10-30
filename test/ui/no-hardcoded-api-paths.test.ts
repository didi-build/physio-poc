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

function isRelativeUiModuleImportLine(line: string): boolean {
  return /^\s*(import|export)\s.*\sfrom\s["'][^"']*\/api\/[^"']*["']/.test(line);
}

function lineHardcodesHttpApiPath(line: string): boolean {
  if (isRelativeUiModuleImportLine(line)) {
    return false;
  }
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
    return false;
  }
  if (/\/api\//.test(line)) {
    return true;
  }
  const runtimeJoin =
    /(?:[`'"]\/api\/[`'"]|[`'"]api\/[`'"]\s*\+|\+\s*[`'"]api\/[`'"])/.test(line);
  return runtimeJoin;
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
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        if (lineHardcodesHttpApiPath(lines[index] ?? "")) {
          violations.push(`${rel}:${index + 1}`);
          break;
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("flags sample /api/ literals outside the client module", () => {
    expect(lineHardcodesHttpApiPath('  return fetch("/api/practitioners/x");')).toBe(
      true,
    );
    expect(lineHardcodesHttpApiPath('import { x } from "../api/foo.js";')).toBe(false);
  });
});
