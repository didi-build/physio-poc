import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import ts from "typescript";

const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

export const WORKER_AUTH_IMPORT_GUARD_ENTRY_PATHS = [
  "src/entry/worker.ts",
  "src/adapters/workers/create-app-dependencies.ts",
  "src/adapters/workers/create-worker-production-app-dependencies.ts",
];

/**
 * @param {string} repoRelativePath
 * @returns {boolean}
 */
export function isForbiddenWorkerProductionAuthDependency(repoRelativePath) {
  const normalized = repoRelativePath.split(sep).join("/");
  if (normalized.includes("fake-google")) {
    return true;
  }
  if (normalized === "src/adapters/node/fake-google-better-auth.ts") {
    return true;
  }
  if (normalized === "src/adapters/node/create-better-auth.ts") {
    return true;
  }
  if (normalized === "src/auth/fake-google-http.ts") {
    return true;
  }
  return false;
}

function scriptKindForPath(path) {
  if (path.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (path.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/**
 * @param {string} repoRoot
 * @param {string} importerRepoPath
 * @param {string} specifierText
 * @returns {string | null}
 */
function resolveRelativeModule(repoRoot, importerRepoPath, specifierText) {
  const importerDir = dirname(importerRepoPath);
  let base = normalize(join(importerDir, specifierText)).split(sep).join("/");
  const candidates = modulePathCandidates(base);
  for (const candidate of candidates) {
    const abs = join(repoRoot, candidate);
    if (existsSync(abs)) {
      return candidate.split(sep).join("/");
    }
  }
  return null;
}

/**
 * @param {string} basePath
 * @returns {string[]}
 */
function modulePathCandidates(basePath) {
  const out = [];
  if (basePath.endsWith(".js")) {
    const tsBase = basePath.slice(0, -3);
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]) {
      out.push(`${tsBase}${ext}`);
    }
    for (const ext of [".ts", ".tsx", ".js"]) {
      out.push(join(tsBase, `index${ext}`).split(sep).join("/"));
    }
    return out;
  }
  if (SCAN_EXTENSIONS.some((ext) => basePath.endsWith(ext))) {
    out.push(basePath);
    return out;
  }
  for (const ext of SCAN_EXTENSIONS) {
    out.push(`${basePath}${ext}`);
  }
  for (const ext of SCAN_EXTENSIONS) {
    out.push(join(basePath, `index${ext}`).split(sep).join("/"));
  }
  return out;
}

/**
 * @param {string} repoRoot
 * @param {string} repoRelativePath
 * @returns {string}
 */
function readModuleSource(repoRoot, repoRelativePath) {
  return readFileSync(join(repoRoot, repoRelativePath), "utf8");
}

/**
 * @param {string | ts.Expression} moduleSpecifier
 * @returns {string | null}
 */
function stringLiteralModuleSpecifier(moduleSpecifier) {
  if (ts.isStringLiteral(moduleSpecifier)) {
    return moduleSpecifier.text;
  }
  return null;
}

/**
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.from
 * @param {string} params.spec
 * @param {Set<string>} params.visited
 * @param {string[]} params.queue
 * @param {Array<{ from: string, module: string }>} params.violations
 */
function followRelativeSpecifier(params) {
  const { repoRoot, from, spec, visited, queue, violations } = params;
  if (!spec.startsWith(".") && !spec.startsWith("..")) {
    return;
  }
  const resolved = resolveRelativeModule(repoRoot, from, spec);
  if (!resolved) {
    return;
  }
  if (isForbiddenWorkerProductionAuthDependency(resolved)) {
    violations.push({ from, module: resolved });
  }
  if (!visited.has(resolved)) {
    queue.push(resolved);
  }
}

/**
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string[]} [options.entryPaths]
 * @returns {{ violations: Array<{ from: string, module: string }>, files: string[] }}
 */
export function scanWorkerAuthImportGraph(options) {
  const repoRoot = options.repoRoot;
  const entryPaths = options.entryPaths ?? WORKER_AUTH_IMPORT_GUARD_ENTRY_PATHS;
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {string[]} */
  const queue = [...entryPaths];
  /** @type {Array<{ from: string, module: string }>} */
  const violations = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const source = readModuleSource(repoRoot, current);
    const sourceFile = ts.createSourceFile(
      current,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForPath(current),
    );
    sourceFile.forEachChild(function visit(node) {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        followRelativeSpecifier({
          repoRoot,
          from: current,
          spec: node.moduleSpecifier.text,
          visited,
          queue,
          violations,
        });
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const spec = stringLiteralModuleSpecifier(node.moduleSpecifier);
        if (spec) {
          followRelativeSpecifier({
            repoRoot,
            from: current,
            spec,
            visited,
            queue,
            violations,
          });
        }
      }
      if (ts.isImportCall(node)) {
        const arg = node.arguments[0];
        const spec =
          arg && ts.isStringLiteral(arg)
            ? arg.text
            : stringLiteralModuleSpecifier(node.moduleSpecifier ?? arg);
        if (spec) {
          followRelativeSpecifier({
            repoRoot,
            from: current,
            spec,
            visited,
            queue,
            violations,
          });
        }
      }
      ts.forEachChild(node, visit);
    });
  }

  return { violations, files: [...visited] };
}

/**
 * @param {string} repoRoot
 * @returns {{ violations: Array<{ from: string, module: string }>, files: string[] }}
 */
export function assertWorkerProductionAuthImportGraph(repoRoot) {
  return scanWorkerAuthImportGraph({ repoRoot });
}
