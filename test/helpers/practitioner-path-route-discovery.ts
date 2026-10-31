import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const HTTP_SRC_ROOT = path.join(process.cwd(), "src/http");
const EXAMPLE_PRACTITIONER_ID = "11111111-1111-4111-8111-111111111111";
const EXAMPLE_EXERCISE_ID = "ex-example";
const EXAMPLE_VERSION_ID = "ver-example";

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

function materializePractitionerRouteRegex(regexSource: string): string[] {
  const expandAlternation = (pattern: string): string[] => {
    const alt = pattern.match(/\(([^)|]+(?:\|[^)|]+)+)\)/);
    if (!alt || !alt[0].includes("|")) {
      return [pattern];
    }
    const options = (alt[1] ?? "").split("|");
    return options.flatMap((option) =>
      expandAlternation(pattern.replace(alt[0], option)),
    );
  };

  return expandAlternation(regexSource).map((pattern) => {
    let sample = pattern.replace(/^\^/, "").replace(/\$$/, "");
    let captureIndex = 0;
    sample = sample.replace(/\\\/\(\[\^\/\]\+\)/g, () => {
      captureIndex += 1;
      if (captureIndex === 1) {
        return `/${EXAMPLE_PRACTITIONER_ID}`;
      }
      if (regexSource.includes("exercise-versions")) {
        return `/${EXAMPLE_VERSION_ID}`;
      }
      return `/${EXAMPLE_EXERCISE_ID}`;
    });
    sample = sample.replace(/\\\//g, "/");
    return sample;
  });
}

function methodsForMatchVariable(source: string, matchVar: string): string[] {
  const methods = new Set<string>();
  const guarded = new RegExp(
    `if\\s*\\(\\s*${matchVar}\\s*&&\\s*request\\.method\\s*===\\s*"([^"]+)"\\s*\\)`,
    "g",
  );
  for (const hit of source.matchAll(guarded)) {
    methods.add(hit[1] ?? "");
  }
  const blockIndex = source.indexOf(`if (${matchVar})`);
  if (blockIndex >= 0) {
    const block = source.slice(blockIndex, blockIndex + 5000);
    for (const hit of block.matchAll(/request\.method\s*===\s*"([^"]+)"/g)) {
      methods.add(hit[1] ?? "");
    }
  }
  return [...methods].filter((value) => value.length > 0);
}

function matchVariableForRegex(source: string, regexStart: number): string | null {
  const before = source.slice(Math.max(0, regexStart - 120), regexStart);
  const pathMatch = before.match(/const\s+(\w+)\s*=\s*path\.match\(/);
  if (pathMatch) {
    return pathMatch[1] ?? null;
  }
  const execMatch = before.match(/const\s+(\w+)\s*=\s*$/);
  if (execMatch) {
    return execMatch[1] ?? null;
  }
  return null;
}

function practitionerRouteRegexesInSource(
  source: string,
): { matchVar: string; regexSource: string }[] {
  const results: { matchVar: string; regexSource: string }[] = [];
  const marker = "/^\\/api\\/practitioners\\/";
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) {
      break;
    }
    const end = source.indexOf("$/", start);
    if (end < 0) {
      break;
    }
    const regexSource = source.slice(start + 1, end + 1);
    const matchVar = matchVariableForRegex(source, start);
    if (matchVar) {
      results.push({ matchVar, regexSource });
    }
    cursor = end + 2;
  }
  return results;
}

/** Scans production HTTP route sources for `/api/practitioners/` path patterns. */
export function discoveredPractitionerPathRouteKeysFromHttpSources(): string[] {
  const keys = new Set<string>();
  for (const file of listHttpSourceFiles(HTTP_SRC_ROOT)) {
    const source = readFileSync(file, "utf8");
    for (const { matchVar, regexSource } of practitionerRouteRegexesInSource(source)) {
      let methods = methodsForMatchVariable(source, matchVar);
      if (methods.length === 0 && regexSource.includes("generate|regenerate")) {
        methods = ["POST"];
      }
      for (const samplePath of materializePractitionerRouteRegex(regexSource)) {
        for (const method of methods) {
          keys.add(`${method} ${samplePath}`);
        }
      }
    }
  }
  return [...keys].sort();
}
