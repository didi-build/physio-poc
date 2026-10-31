import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PRACTITIONER_PATH_ROUTE_SAMPLES,
  practitionerPathRouteSampleKey,
} from "./practitioner-path-route-registry.js";

const HTTP_SRC_ROOT = path.join(process.cwd(), "src/http");
const EXAMPLE_PRACTITIONER_ID = "11111111-1111-4111-8111-111111111111";
const EXAMPLE_EXERCISE_ID = "ex-example";
const EXAMPLE_VERSION_ID = "ver-example";

export class PractitionerRouteDiscoveryError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join("\n"));
    this.name = "PractitionerRouteDiscoveryError";
  }
}

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

function excludedRanges(source: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const hit of source.matchAll(
    /export function \w*RouteCases\w*\([\s\S]*?\n\}/g,
  )) {
    ranges.push({ start: hit.index ?? 0, end: (hit.index ?? 0) + hit[0].length });
  }
  return ranges;
}

function inExcludedRange(
  index: number,
  ranges: { start: number; end: number }[],
): boolean {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function expandAlternation(pattern: string): string[] {
  const alt = pattern.match(/\(([^)|]+(?:\|[^)|]+)+)\)/);
  if (!alt || !alt[0].includes("|")) {
    return [pattern];
  }
  const options = (alt[1] ?? "").split("|");
  return options.flatMap((option) =>
    expandAlternation(pattern.replace(alt[0], option)),
  );
}

function materializePractitionerRouteRegex(regexSource: string): string[] {
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
  const negatedReturn = source.match(
    new RegExp(`if\\s*\\(\\s*!${matchVar}\\s*\\)[\\s\\S]*?return null;`),
  );
  if (negatedReturn) {
    const block = source.slice(
      negatedReturn.index ?? 0,
      (negatedReturn.index ?? 0) + 12000,
    );
    for (const hit of block.matchAll(/request\.method\s*!==\s*"([^"]+)"/g)) {
      methods.add(hit[1] ?? "");
    }
    if (methods.size === 0) {
      methods.add("POST");
    }
  }
  const blockIndex = source.indexOf(`if (${matchVar})`);
  if (blockIndex >= 0) {
    const block = source.slice(blockIndex, blockIndex + 8000);
    for (const hit of block.matchAll(/request\.method\s*===\s*"([^"]+)"/g)) {
      methods.add(hit[1] ?? "");
    }
  }
  return [...methods].filter((value) => value.length > 0);
}

function matchVariableBeforeRegex(source: string, regexStart: number): string | null {
  const before = source.slice(Math.max(0, regexStart - 160), regexStart);
  const pathMatch = before.match(/const\s+(\w+)\s*=\s*path\.match\(\s*$/);
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
): { matchVar: string; regexSource: string; index: number; length: number }[] {
  const results: {
    matchVar: string;
    regexSource: string;
    index: number;
    length: number;
  }[] = [];
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
    const matchVar = matchVariableBeforeRegex(source, start);
    if (matchVar) {
      results.push({
        matchVar,
        regexSource,
        index: start,
        length: end + 2 - start,
      });
    }
    cursor = end + 2;
  }
  return results;
}

function moduleLevelPractitionerRegexConstants(
  source: string,
): Map<string, { regexSource: string; index: number; length: number }> {
  const constants = new Map<
    string,
    { regexSource: string; index: number; length: number }
  >();
  for (const hit of source.matchAll(
    /const\s+(\w+)\s*=\s*(\/\^\\\/api\\\/practitioners\\\/[\s\S]*?\$\/\w*)\s*;/g,
  )) {
    const body = hit[2] ?? "";
    constants.set(hit[1] ?? "", {
      regexSource: body.slice(1, body.lastIndexOf("/")),
      index: hit.index ?? 0,
      length: hit[0].length,
    });
  }
  return constants;
}

function keysForLibraryPathPredicate(): string[] {
  return PRACTITIONER_PATH_ROUTE_SAMPLES.filter(
    (sample) => sample.ruleId === "exercise-library",
  ).map(practitionerPathRouteSampleKey);
}

function addRegexRouteKeys(
  source: string,
  relPath: string,
  regexSource: string,
  matchVar: string,
  issues: string[],
  keys: Set<string>,
  covered: { start: number; end: number }[],
  span: { index: number; length: number },
): void {
  covered.push({ start: span.index, end: span.index + span.length });
  if (!regexSource.startsWith("^") || !regexSource.endsWith("$")) {
    issues.push(
      `${relPath}: practitioner route regex must be anchored (^…$): /${regexSource}/`,
    );
  }
  let methods = methodsForMatchVariable(source, matchVar);
  if (methods.length === 0 && regexSource.includes("generate|regenerate")) {
    methods = ["POST"];
  }
  if (methods.length === 0) {
    issues.push(
      `${relPath}: practitioner route regex has no determinable HTTP method: /${regexSource}/`,
    );
    return;
  }
  for (const samplePath of materializePractitionerRouteRegex(regexSource)) {
    for (const method of methods) {
      keys.add(`${method} ${samplePath}`);
    }
  }
}

function addStartsWithEndsWithKeys(
  source: string,
  relPath: string,
  issues: string[],
  keys: Set<string>,
  covered: { start: number; end: number }[],
): void {
  for (const hit of source.matchAll(
    /if\s*\(\s*path\.startsWith\(([^)]*\/api\/practitioners\/[^)]*)\)([\s\S]{0,500}?)\)\s*\{/g,
  )) {
    const block = hit[0];
    const index = hit.index ?? 0;
    covered.push({ start: index, end: index + block.length });
    const methods = [...block.matchAll(/request\.method\s*===\s*"([^"]+)"/g)].map(
      (m) => m[1] ?? "",
    );
    if (methods.length === 0) {
      issues.push(`${relPath}: startsWith practitioner path guard has no HTTP method`);
      continue;
    }
    const suffix = block.match(/path\.endsWith\(["'`]([^"'`]+)["'`]\)/)?.[1] ?? "";
    const samplePath = `/api/practitioners/${EXAMPLE_PRACTITIONER_ID}${suffix}`;
    for (const method of methods) {
      keys.add(`${method} ${samplePath}`);
    }
  }
}

function isRangeCovered(
  index: number,
  length: number,
  covered: { start: number; end: number }[],
): boolean {
  return covered.some((range) => index >= range.start && index + length <= range.end);
}

function scanUnmappedPractitionerPatterns(
  source: string,
  relPath: string,
  skipRanges: { start: number; end: number }[],
  covered: { start: number; end: number }[],
  issues: string[],
): void {
  const patterns = [
    /\/\^\\\/api\\\/practitioners\\\/[\s\S]*?\$\//g,
    /\/api\/practitioners\//g,
    /\\\/api\\\/practitioners\\\//g,
  ];
  for (const pattern of patterns) {
    for (const hit of source.matchAll(pattern)) {
      const index = hit.index ?? 0;
      if (inExcludedRange(index, skipRanges)) {
        continue;
      }
      if (isRangeCovered(index, hit[0].length, covered)) {
        continue;
      }
      issues.push(
        `${relPath}: unmapped practitioner path pattern near index ${index}: ${JSON.stringify(hit[0]).slice(0, 120)}`,
      );
    }
  }
}

function analyzeFile(filePath: string, issues: string[]): Set<string> {
  const relPath = path.relative(process.cwd(), filePath);
  const source = readFileSync(filePath, "utf8");
  const skipRanges = excludedRanges(source);
  const keys = new Set<string>();
  const covered: { start: number; end: number }[] = [];

  for (const hit of source.matchAll(
    /\/\^\\\/api\\\/practitioners\\\/[\s\S]*?\$\/\.test\(\s*[\s\S]*?\)/g,
  )) {
    const index = hit.index ?? 0;
    if (inExcludedRange(index, skipRanges)) {
      continue;
    }
    covered.push({ start: index, end: index + hit[0].length });
    for (const key of keysForLibraryPathPredicate()) {
      keys.add(key);
    }
  }

  for (const route of practitionerRouteRegexesInSource(source)) {
    if (inExcludedRange(route.index, skipRanges)) {
      continue;
    }
    addRegexRouteKeys(
      source,
      relPath,
      route.regexSource,
      route.matchVar,
      issues,
      keys,
      covered,
      route,
    );
  }

  const constants = moduleLevelPractitionerRegexConstants(source);
  for (const [constName, info] of constants.entries()) {
    if (inExcludedRange(info.index, skipRanges)) {
      continue;
    }
    const useMatch = source.match(
      new RegExp(`const\\s+(\\w+)\\s*=\\s*path\\.match\\(\\s*${constName}\\s*\\)`),
    );
    if (!useMatch) {
      issues.push(
        `${relPath}: module-level practitioner regex constant ${constName} is not used in path.match(...)`,
      );
      continue;
    }
    covered.push({ start: info.index, end: info.index + info.length });
    addRegexRouteKeys(
      source,
      relPath,
      info.regexSource,
      useMatch[1] ?? "",
      issues,
      keys,
      covered,
      info,
    );
  }

  addStartsWithEndsWithKeys(source, relPath, issues, keys, covered);
  scanUnmappedPractitionerPatterns(source, relPath, skipRanges, covered, issues);

  return keys;
}

/** Scans production HTTP route sources for `/api/practitioners/` path patterns. */
export function discoveredPractitionerPathRouteKeysFromHttpSources(): string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const file of listHttpSourceFiles(HTTP_SRC_ROOT)) {
    for (const key of analyzeFile(file, issues)) {
      keys.add(key);
    }
  }

  const expected = PRACTITIONER_PATH_ROUTE_SAMPLES.map(
    practitionerPathRouteSampleKey,
  ).sort();
  const discovered = [...keys].sort();

  for (const sample of expected) {
    if (!keys.has(sample)) {
      issues.push(`registry sample not discovered in HTTP sources: ${sample}`);
    }
  }
  for (const key of discovered) {
    if (!expected.includes(key)) {
      issues.push(`discovered route not in registry samples: ${key}`);
    }
  }

  if (issues.length > 0) {
    throw new PractitionerRouteDiscoveryError(issues);
  }

  return discovered;
}
