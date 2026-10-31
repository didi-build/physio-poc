import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import ts from "typescript";
import { WORKER_AUTH_IMPORT_GUARD_ENTRY_PATHS } from "./worker-auth-import-guard.mjs";

const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

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

function resolveRelativeModule(repoRoot, importerRepoPath, specifierText) {
  const importerDir = dirname(importerRepoPath);
  const base = normalize(join(importerDir, specifierText)).split(sep).join("/");
  const candidates = modulePathCandidates(base);
  for (const candidate of candidates) {
    const abs = join(repoRoot, candidate);
    if (existsSync(abs)) {
      return candidate.split(sep).join("/");
    }
  }
  return null;
}

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

function readModuleSource(repoRoot, repoRelativePath) {
  return readFileSync(join(repoRoot, repoRelativePath), "utf8");
}

function collectModuleSpecifierFromNode(node, specifiers, dynamicImportPolicy) {
  if (!node) {
    return;
  }
  if (ts.isStringLiteral(node)) {
    specifiers.push(node.text);
    return;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    specifiers.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    dynamicImportPolicy.interpolated += 1;
  }
}

function collectDynamicImportArgument(arg, specifiers, dynamicImportPolicy) {
  if (!arg) {
    dynamicImportPolicy.nonLiteral += 1;
    return;
  }
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    collectModuleSpecifierFromNode(arg, specifiers, dynamicImportPolicy);
    return;
  }
  if (ts.isTemplateExpression(arg)) {
    dynamicImportPolicy.interpolated += 1;
    return;
  }
  dynamicImportPolicy.nonLiteral += 1;
}

function extractImportSpecifiersFromSource(repoRelativePath, source) {
  const specifiers = [];
  const dynamicImportPolicy = { interpolated: 0, nonLiteral: 0 };
  const sourceFile = ts.createSourceFile(
    repoRelativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(repoRelativePath),
  );

  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      collectModuleSpecifierFromNode(
        node.moduleSpecifier,
        specifiers,
        dynamicImportPolicy,
      );
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      collectModuleSpecifierFromNode(
        node.moduleSpecifier,
        specifiers,
        dynamicImportPolicy,
      );
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      collectDynamicImportArgument(node.arguments[0], specifiers, dynamicImportPolicy);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments[0]
    ) {
      collectModuleSpecifierFromNode(
        node.arguments[0],
        specifiers,
        dynamicImportPolicy,
      );
    }
    if (ts.isExternalModuleReference(node)) {
      const expr = node.expression;
      if (expr && ts.isStringLiteral(expr)) {
        specifiers.push(expr.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    specifiers,
    interpolatedDynamicImportCount: dynamicImportPolicy.interpolated,
    nonLiteralDynamicImportCount: dynamicImportPolicy.nonLiteral,
  };
}

function isProcessEnvAccess(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  );
}

function scanProcessEnvInSource(source, repoRelativePath) {
  const hits = [];
  const sourceFile = ts.createSourceFile(
    repoRelativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForPath(repoRelativePath),
  );
  function visit(node) {
    if (isProcessEnvAccess(node)) {
      hits.push(repoRelativePath);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return hits;
}

/**
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string[]} [options.entryPaths]
 * @returns {{ violations: string[], files: string[] }}
 */
export function scanWorkerProductionProcessEnvUsage(options) {
  const repoRoot = options.repoRoot;
  const entryPaths = options.entryPaths ?? WORKER_AUTH_IMPORT_GUARD_ENTRY_PATHS;
  const visited = new Set();
  const queue = [...entryPaths];
  const violations = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const abs = join(repoRoot, current);
    if (!existsSync(abs)) {
      continue;
    }
    const source = readModuleSource(repoRoot, current);
    violations.push(...scanProcessEnvInSource(source, current));

    const { specifiers } = extractImportSpecifiersFromSource(current, source);
    for (const spec of specifiers) {
      if (!spec.startsWith(".") && !spec.startsWith("..")) {
        continue;
      }
      const resolved = resolveRelativeModule(repoRoot, current, spec);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return { violations: [...new Set(violations)], files: [...visited] };
}

export function assertWorkerProductionProcessEnvGuard(repoRoot) {
  const { violations, files } = scanWorkerProductionProcessEnvUsage({ repoRoot });
  return { violations, files };
}
