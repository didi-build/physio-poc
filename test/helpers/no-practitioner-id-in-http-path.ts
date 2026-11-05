import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const HTTP_SRC_ROOT = path.join(process.cwd(), "src/http");

const FORBIDDEN_PATH_MARKERS = [
  "/api/practitioners/",
  String.raw`\/api\/practitioners\/`,
] as const;

function listHttpSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listHttpSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Matcher-independent guard: no HTTP handler source may reference practitioner id path segments.
 */
export function assertNoPractitionerIdInHttpRouteSources(): void {
  const issues: string[] = [];
  for (const file of listHttpSourceFiles(HTTP_SRC_ROOT)) {
    const relPath = path.relative(process.cwd(), file);
    const source = readFileSync(file, "utf8");
    for (const marker of FORBIDDEN_PATH_MARKERS) {
      if (source.includes(marker)) {
        issues.push(
          `${relPath}: contains forbidden path marker ${JSON.stringify(marker)}`,
        );
      }
    }
  }
  if (issues.length > 0) {
    throw new Error(issues.join("\n"));
  }
}
