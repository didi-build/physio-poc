import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const WORKFLOWS_DIR_ENV = "VERIFY_ACTION_PINS_WORKFLOWS_DIR";
export const ACTIONS_DIR_ENV = "VERIFY_ACTION_PINS_ACTIONS_DIR";

const FULL_SHA_RE = /^[0-9a-f]{40}$/i;
const DOCKER_DIGEST_RE = /^docker:\/\/[^@]+@sha256:[0-9a-f]{64}$/i;

const FLOW_USES_RE = /\{[^}]*\buses:\s*([^,\s}]+)/g;
const USES_LINE_RE = /\buses:\s*(.+?)(?:\s+#.*)?$/;

function stripQuotes(spec) {
  if (
    (spec.startsWith('"') && spec.endsWith('"')) ||
    (spec.startsWith("'") && spec.endsWith("'"))
  ) {
    return spec.slice(1, -1);
  }
  return spec;
}

/** @returns {{ spec: string, line: number }[]} */
export function extractUsesEntries(yamlText) {
  const entries = [];
  const lines = yamlText.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/\{[^}]*\buses:/.test(line)) {
      for (const flowMatch of line.matchAll(FLOW_USES_RE)) {
        entries.push({ spec: stripQuotes(flowMatch[1].trim()), line: index + 1 });
      }
      continue;
    }
    const plain = line.match(USES_LINE_RE);
    if (!plain) continue;
    const spec = stripQuotes(plain[1].trim());
    entries.push({ spec, line: index + 1 });
  }
  return entries;
}

/**
 * @returns {"local" | "docker-digest" | "remote-sha" | "invalid"}
 */
export function classifyUsesSpec(spec) {
  if (spec.startsWith("./") || spec.startsWith("../")) {
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

/**
 * @param {{ workflowsDir: string, actionsDir?: string | null }} roots
 */
export function collectUsesProblems(roots) {
  const problems = [];
  let totalUses = 0;
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
          spec: path,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      for (const entry of extractUsesEntries(text)) {
        totalUses += 1;
        const validation = validateUsesSpec(entry.spec);
        if (!validation.ok) {
          problems.push({
            file: `${label}/${file}`,
            spec: entry.spec,
            reason: validation.reason,
          });
        }
      }
    }
  }

  return { problems, totalUses };
}

export function extractTagComment(lineText) {
  const match = /#\s*(v[^\s]+)/.exec(lineText);
  return match?.[1] ?? null;
}

/** @returns {{ file: string, spec: string, repo: string, sha: string, tag: string | null, line: number }[]} */
export function collectRemoteShaUsesFromFile(relativeFile, yamlText) {
  const lines = yamlText.split("\n");
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
