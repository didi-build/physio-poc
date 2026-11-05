import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, normalize, relative, resolve } from "node:path";

export const WORKFLOWS_DIR_ENV = "VERIFY_ACTION_PINS_WORKFLOWS_DIR";
export const ACTIONS_DIR_ENV = "VERIFY_ACTION_PINS_ACTIONS_DIR";
export const REPO_ROOT_ENV = "VERIFY_ACTION_PINS_REPO_ROOT";

const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
const DOCKER_DIGEST_RE = /^docker:\/\/[^@]+@sha256:[0-9a-f]{64}$/i;

const STRICT_USES_LINE_RE = /^\s*(?:-\s+)?uses:\s+(.+?)(?:\s+#.*)?$/;

function stripQuotes(spec) {
  if (
    (spec.startsWith('"') && spec.endsWith('"')) ||
    (spec.startsWith("'") && spec.endsWith("'"))
  ) {
    return spec.slice(1, -1);
  }
  return spec;
}

export function normalizeLineEndings(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** @param {string} line */
export function isFullLineComment(line) {
  return line.trimStart().startsWith("#");
}

/** Decode a YAML 1.1 double-quoted scalar (key fragment only). */
export function decodeYamlDoubleQuotedScalar(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i] ?? "";
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      throw new Error("invalid escape");
    }
    if (next === "x") {
      const hex = raw.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
        throw new Error("invalid \\x escape");
      }
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 3;
      continue;
    }
    if (next === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw new Error("invalid \\u escape");
      }
      out += String.fromCodePoint(Number.parseInt(hex, 16));
      i += 5;
      continue;
    }
    if (next === "U") {
      const hex = raw.slice(i + 2, i + 10);
      if (!/^[0-9a-fA-F]{8}$/.test(hex)) {
        throw new Error("invalid \\U escape");
      }
      out += String.fromCodePoint(Number.parseInt(hex, 16));
      i += 9;
      continue;
    }
    const simple = {
      "\\": "\\",
      '"': '"',
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    }[next];
    if (simple === undefined) {
      throw new Error(`invalid escape \\${next}`);
    }
    out += simple;
    i += 1;
  }
  return out;
}

/** @param {string} line */
export function extractDoubleQuotedYamlKey(line) {
  const match = line.match(/^\s*(?:-\s+)?"((?:[^"\\]|\\.)*)"\s*:/);
  return match?.[1] ?? null;
}

/** @param {string} line */
export function lineHasDoubleQuotedKeyWithBackslash(line) {
  const key = extractDoubleQuotedYamlKey(line);
  return key !== null && key.includes("\\");
}

/** @param {string} line */
export function lineDecodesToUsesKey(line) {
  const key = extractDoubleQuotedYamlKey(line);
  if (key === null) {
    return false;
  }
  if (!key.includes("\\")) {
    return false;
  }
  try {
    return decodeYamlDoubleQuotedScalar(key) === "uses";
  } catch {
    return true;
  }
}

/** @param {string} line */
export function lineContainsUsesToken(line) {
  return (
    /\buses\b/i.test(line) ||
    line.includes('"uses"') ||
    line.includes("'uses'") ||
    /uses\s*:/i.test(line) ||
    /\\u0075ses|\\x75ses/i.test(line) ||
    lineHasDoubleQuotedKeyWithBackslash(line)
  );
}

/** @param {string} line */
export function lineHasYamlAnchorOrAlias(line) {
  return /[&*]/.test(line);
}

/** @param {string} line */
export function parseStrictUsesLine(line) {
  const match = line.match(STRICT_USES_LINE_RE);
  if (!match) {
    return null;
  }
  return stripQuotes(match[1].trim());
}

/**
 * @param {string} yamlText
 * @returns {{ spec: string, line: number }[]}
 */
export function extractUsesEntries(yamlText) {
  const entries = [];
  const lines = normalizeLineEndings(yamlText).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (isFullLineComment(line)) continue;
    if (!lineContainsUsesToken(line)) continue;
    const spec = parseStrictUsesLine(line);
    if (spec) {
      entries.push({ spec, line: index + 1 });
    }
  }
  return entries;
}

/**
 * @returns {"local" | "docker-digest" | "remote-sha" | "invalid"}
 */
export function classifyUsesSpec(spec) {
  if (spec.startsWith("../")) {
    return "invalid";
  }
  if (spec.startsWith("./")) {
    return "local";
  }
  if (spec.startsWith("docker://")) {
    return DOCKER_DIGEST_RE.test(spec) ? "docker-digest" : "invalid";
  }
  const at = spec.lastIndexOf("@");
  if (at === -1) {
    return "invalid";
  }
  const ref = spec.slice(at + 1);
  return FULL_SHA_RE.test(ref) ? "remote-sha" : "invalid";
}

export function validateUsesSpec(spec) {
  const kind = classifyUsesSpec(spec);
  if (kind === "invalid") {
    if (spec.startsWith("../")) {
      return { ok: false, reason: "local action path must not escape the repository" };
    }
    if (spec.startsWith("docker://")) {
      return { ok: false, reason: "docker image must be pinned by sha256 digest" };
    }
    const at = spec.lastIndexOf("@");
    if (at === -1) {
      return { ok: false, reason: "missing @ ref" };
    }
    return { ok: false, reason: "ref is not a 40-character commit SHA" };
  }
  return { ok: true, kind };
}

function listTopLevelYamlFiles(dir) {
  if (!existsSync(dir)) {
    throw new Error(`missing directory: ${dir}`);
  }
  return readdirSync(dir).filter(
    (name) => name.endsWith(".yml") || name.endsWith(".yaml"),
  );
}

/** @returns {string[]} absolute paths */
function listYamlFilesRecursive(dir) {
  if (!existsSync(dir)) {
    throw new Error(`missing directory: ${dir}`);
  }
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listYamlFilesRecursive(path));
    } else if (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml")) {
      results.push(path);
    }
  }
  return results;
}

function readWorkflowFile(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch {
    throw new Error(`unreadable file: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`unreadable file: ${path}`);
  }
  return readFileSync(path, "utf8");
}

function isPathInsideRepo(repoRoot, targetPath) {
  const rel = relative(repoRoot, targetPath);
  return !rel.startsWith("..");
}

function isWorkflowFilePath(absPath) {
  if (!absPath.endsWith(".yml") && !absPath.endsWith(".yaml")) {
    return false;
  }
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function resolveLocalUsesTarget(spec, repoRoot) {
  if (spec.startsWith("../")) {
    return { ok: false, reason: "local action path must not escape the repository" };
  }
  if (!spec.startsWith("./")) {
    return { ok: false, reason: "expected local action path" };
  }
  const targetPath = normalize(resolve(repoRoot, spec.slice(2)));
  if (!isPathInsideRepo(repoRoot, targetPath)) {
    return { ok: false, reason: "local action path must not escape the repository" };
  }
  if (isWorkflowFilePath(targetPath)) {
    return { ok: true, kind: "workflow", path: targetPath };
  }
  for (const name of ["action.yml", "action.yaml"]) {
    const manifest = join(targetPath, name);
    if (existsSync(manifest)) {
      return { ok: true, kind: "action", path: manifest };
    }
  }
  return { ok: false, reason: "missing action.yml or action.yaml for local action" };
}

/**
 * @param {{
 *   relativeFile: string,
 *   absPath: string,
 *   yamlText: string,
 *   repoRoot: string,
 *   visited: Set<string>,
 *   problems: object[],
 *   totalUses: { count: number },
 * }} ctx
 */
function scanYamlUses(ctx) {
  const normalized = normalizeLineEndings(ctx.yamlText);
  const lines = normalized.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (isFullLineComment(line)) continue;
    if (!lineContainsUsesToken(line)) continue;
    const lineNumber = index + 1;
    if (lineHasYamlAnchorOrAlias(line)) {
      ctx.problems.push({
        file: ctx.relativeFile,
        line: lineNumber,
        spec: "",
        reason: "YAML anchors and aliases are not allowed on uses lines",
      });
      continue;
    }
    const spec = parseStrictUsesLine(line);
    if (!spec) {
      ctx.problems.push({
        file: ctx.relativeFile,
        line: lineNumber,
        spec: "",
        reason: "line contains uses but is not exactly uses: <ref>",
      });
      continue;
    }
    ctx.totalUses.count += 1;
    const validation = validateUsesSpec(spec);
    if (!validation.ok) {
      ctx.problems.push({
        file: ctx.relativeFile,
        line: lineNumber,
        spec,
        reason: validation.reason,
      });
      continue;
    }
    if (validation.kind !== "local") {
      continue;
    }
    const resolved = resolveLocalUsesTarget(spec, ctx.repoRoot);
    if (!resolved.ok) {
      ctx.problems.push({
        file: ctx.relativeFile,
        line: lineNumber,
        spec,
        reason: resolved.reason,
      });
      continue;
    }
    const nestedPath = resolved.path;
    if (ctx.visited.has(nestedPath)) {
      continue;
    }
    ctx.visited.add(nestedPath);
    let nestedText;
    try {
      nestedText = readWorkflowFile(nestedPath);
    } catch (error) {
      ctx.problems.push({
        file: ctx.relativeFile,
        line: lineNumber,
        spec,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const nestedRelative = relative(ctx.repoRoot, nestedPath).split("\\").join("/");
    scanYamlUses({
      ...ctx,
      relativeFile: nestedRelative,
      absPath: nestedPath,
      yamlText: nestedText,
    });
  }
}

function scanFileAtPath(ctx, absPath, relativeFile) {
  let text;
  try {
    text = readWorkflowFile(absPath);
  } catch (error) {
    ctx.problems.push({
      file: relativeFile,
      line: 0,
      spec: absPath,
      reason: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  scanYamlUses({
    ...ctx,
    relativeFile,
    absPath,
    yamlText: text,
  });
}

/**
 * @param {{ workflowsDir: string, actionsDir?: string | null, repoRoot?: string }} roots
 */
export function collectUsesProblems(roots) {
  const problems = [];
  const totalUses = { count: 0 };
  const repoRoot = roots.repoRoot ?? process.cwd();
  const visited = new Set();
  const ctx = { repoRoot, visited, problems, totalUses };

  let workflowFiles;
  try {
    workflowFiles = listTopLevelYamlFiles(roots.workflowsDir);
  } catch (error) {
    problems.push({
      file: "workflows",
      line: 0,
      spec: roots.workflowsDir,
      reason: error instanceof Error ? error.message : String(error),
    });
    workflowFiles = [];
  }

  for (const file of workflowFiles) {
    const path = join(roots.workflowsDir, file);
    scanFileAtPath(ctx, path, `workflows/${file}`);
  }

  if (roots.actionsDir && existsSync(roots.actionsDir)) {
    let actionYamlPaths;
    try {
      actionYamlPaths = listYamlFilesRecursive(roots.actionsDir);
    } catch (error) {
      problems.push({
        file: "actions",
        line: 0,
        spec: roots.actionsDir,
        reason: error instanceof Error ? error.message : String(error),
      });
      actionYamlPaths = [];
    }
    for (const absPath of actionYamlPaths) {
      const base = absPath.split("/").pop() ?? "";
      if (base !== "action.yml" && base !== "action.yaml") {
        continue;
      }
      const relativeFile = relative(repoRoot, absPath).split("\\").join("/");
      if (visited.has(absPath)) {
        continue;
      }
      visited.add(absPath);
      scanFileAtPath(ctx, absPath, relativeFile);
    }
  }

  return { problems, totalUses: totalUses.count };
}

export function extractTagComment(lineText) {
  const match = /#\s*(v[^\s]+)/.exec(lineText);
  return match?.[1] ?? null;
}

function collectRemoteFromYamlText(relativeFile, yamlText, refs) {
  const lines = normalizeLineEndings(yamlText).split("\n");
  for (const entry of extractUsesEntries(yamlText)) {
    if (classifyUsesSpec(entry.spec) !== "remote-sha") continue;
    const at = entry.spec.lastIndexOf("@");
    refs.push({
      file: relativeFile,
      spec: entry.spec,
      repo: entry.spec.slice(0, at),
      sha: entry.spec.slice(at + 1),
      tag: extractTagComment(lines[entry.line - 1] ?? ""),
      line: entry.line,
    });
  }
}

/** @returns {{ file: string, spec: string, repo: string, sha: string, tag: string | null, line: number }[]} */
export function collectRemoteShaUsesFromFile(relativeFile, yamlText) {
  const refs = [];
  collectRemoteFromYamlText(relativeFile, yamlText, refs);
  return refs;
}

function collectRemoteFromTree(absPath, relativeFile, repoRoot, visited, refs) {
  if (visited.has(absPath)) {
    return;
  }
  visited.add(absPath);
  const text = readWorkflowFile(absPath);
  collectRemoteFromYamlText(relativeFile, text, refs);
  for (const entry of extractUsesEntries(text)) {
    if (classifyUsesSpec(entry.spec) !== "local") continue;
    const resolved = resolveLocalUsesTarget(entry.spec, repoRoot);
    if (!resolved.ok) continue;
    const nestedRelative = relative(repoRoot, resolved.path).split("\\").join("/");
    collectRemoteFromTree(resolved.path, nestedRelative, repoRoot, visited, refs);
  }
}

/**
 * @param {{ workflowsDir: string, actionsDir?: string | null, repoRoot?: string }} roots
 */
export function collectAllRemoteShaUses(roots) {
  const repoRoot = roots.repoRoot ?? process.cwd();
  const refs = [];
  const visited = new Set();

  if (existsSync(roots.workflowsDir)) {
    for (const file of listTopLevelYamlFiles(roots.workflowsDir)) {
      const path = join(roots.workflowsDir, file);
      collectRemoteFromTree(path, `workflows/${file}`, repoRoot, visited, refs);
    }
  }

  if (roots.actionsDir && existsSync(roots.actionsDir)) {
    for (const absPath of listYamlFilesRecursive(roots.actionsDir)) {
      const base = absPath.split("/").pop() ?? "";
      if (base !== "action.yml" && base !== "action.yaml") continue;
      const relativeFile = relative(repoRoot, absPath).split("\\").join("/");
      collectRemoteFromTree(absPath, relativeFile, repoRoot, visited, refs);
    }
  }

  return refs;
}
