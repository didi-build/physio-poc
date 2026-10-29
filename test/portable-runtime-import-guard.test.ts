import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");
const PORTABLE_DIRS = [
  join(REPO_ROOT, "src/domain"),
  join(REPO_ROOT, "src/services"),
  join(REPO_ROOT, "src/storage"),
  join(REPO_ROOT, "src/http"),
];

function listTypeScriptFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("portable runtime import guard (unit)", () => {
  it("domain, services, storage, and http avoid platform imports", () => {
    const forbiddenSpecifiers =
      /(?:from\s+["'](?!\.)([^"']+)["'])|(?:import\s*["'](?!\.)([^"']+)["'])|(?:import\s*\(\s*["'](?!\.)([^"']+)["'])|(?:require\s*\(\s*["'](?!\.)([^"']+)["'])/;
    const bannedTokens = [
      /\bprocess\./,
      /globalThis\.env/,
      /\bR2Bucket\b/,
      /\bD1Database\b/,
      /\bKVNamespace\b/,
      /\bDurableObjectNamespace\b/,
      /\bfrom\s+["']node:/,
      /\bfrom\s+["']cloudflare:/,
      /\b@cloudflare\//,
    ];

    for (const dir of PORTABLE_DIRS) {
      for (const file of listTypeScriptFiles(dir)) {
        const source = readFileSync(file, "utf8");
        for (const line of source.split("\n")) {
          expect(
            forbiddenSpecifiers.test(line),
            `non-relative import in ${relative(REPO_ROOT, file)}: ${line}`,
          ).toBe(false);
        }
        for (const token of bannedTokens) {
          expect(
            token.test(source),
            `banned token in ${relative(REPO_ROOT, file)}`,
          ).toBe(false);
        }
      }
    }
  });
});
