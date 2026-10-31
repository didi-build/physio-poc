import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

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

/** @param {string} line */
export function lineContainsUsesToken(line) {
  return (
    /\buses\b/.test(line) ||
    line.includes('"uses"') ||
    line.includes("'uses'") ||
    /uses\s*:/.test(line)
  );
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

function listYamlFiles(dir) {
  if (!existsSync(dir)) {
    throw new Error(`missing directory: ${dir}`);
  }
  return readdirSync(dir).filter(
    (name) => name.endsWith(".yml") || name.endsWith(".yaml"),
  );
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
  return rel !== "" && !rel.startsWith("..");
}

function resolveLocalActionManifest(fromFile, spec, repoRoot) {
  if (spec.startsWith("../")) {
    return { ok: false, reason: "local action path must not escape the repository" };
  }
  if (!spec.startsWith("./")) {
    return { ok: false, reason: "expected local action path" };
  }
  const baseDir = dirname(fromFile);
  const actionDir = normalize(resolve(baseDir, spec));
  if (!isPathInsideRepo(repoRoot, actionDir)) {
    return { ok: false, reason: "local action path must not escape the repository" };
  }
  for (const name of ["action.yml", "action.yaml"]) {
    const manifest = join(actionDir, name);
    if (existsSync(manifest)) {
      return { ok: true, path: manifest };
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
    const spec = parseStrictUsesLine(line);
    const lineNumber = index + 1;
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
    const resolved = resolveLocalActionManifest(ctx.absPath, spec, ctx.repoRoot);
    if (!resolved.ok) {
      ctx.problems.push({
        file: ctx.relativeFile,
        line: lineNumber,
        spec,
        reason: resolved.reason,
      });
      continue;
    }
    const manifestPath = resolved.path;
    if (ctx.visited.has(manifestPath)) {
      continue;
    }
    ctx.visited.add(manifestPath);
    let nestedText;
    try {
      nestedText = readWorkflowFile(manifestPath);
    } catch (error) {
      ctx.problems.push({
        file: ctx.relativeFile,
        line: lineNumber,
        spec,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const nestedRelative = relative(ctx.repoRoot, manifestPath).split("\\").join("/");
    scanYamlUses({
      ...ctx,
      relativeFile: nestedRelative,
      absPath: manifestPath,
      yamlText: nestedText,
    });
  }
}

/**
 * @param {{ workflowsDir: string, actionsDir?: string | null, repoRoot?: string }} roots
 */
export function collectUsesProblems(roots) {
  const problems = [];
  const totalUses = { count: 0 };
  const repoRoot = roots.repoRoot ?? process.cwd();
  const visited = new Set();
  const dirs = [{ label: "workflows", dir: roots.workflowsDir }];
  if (roots.actionsDir && existsSync(roots.actionsDir)) {
    dirs.push({ label: "actions", dir: roots.actionsDir });
  }

  for (const { label, dir } of dirs) {
    let files;
    try {
      files = listYamlFiles(dir);
    } catch (error) {
      problems.push({
        file: label,
        line: 0,
        spec: dir,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    for (const file of files) {
      const path = join(dir, file);
      let text;
      try {
        text = readWorkflowFile(path);
      } catch (error) {
        problems.push({
          file: `${label}/${file}`,
          line: 0,
          spec: path,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      scanYamlUses({
        relativeFile: `${label}/${file}`,
        absPath: path,
        yamlText: text,
        repoRoot,
        visited,
        problems,
        totalUses,
      });
    }
  }

  return { problems, totalUses: totalUses.count };
}

export function extractTagComment(lineText) {
  const match = /#\s*(v[^\s]+)/.exec(lineText);
  return match?.[1] ?? null;
}

/** @returns {{ file: string, spec: string, repo: string, sha: string, tag: string | null, line: number }[]} */
export function collectRemoteShaUsesFromFile(relativeFile, yamlText) {
  const lines = normalizeLineEndings(yamlText).split("\n");
  const refs = [];
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
  return refs;
}

export function collectAllRemoteShaUses(roots) {
  const refs = [];
  const dirs = [{ prefix: "workflows", dir: roots.workflowsDir }];
  if (roots.actionsDir && existsSync(roots.actionsDir)) {
    dirs.push({ prefix: "actions", dir: roots.actionsDir });
  }
  for (const { prefix, dir } of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of listYamlFiles(dir)) {
      const path = join(dir, file);
      const text = readWorkflowFile(path);
      refs.push(...collectRemoteShaUsesFromFile(`${prefix}/${file}`, text));
    }
  }
  return refs;
}
