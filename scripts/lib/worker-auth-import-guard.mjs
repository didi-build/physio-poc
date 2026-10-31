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

/**
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string[]} [options.entryPaths]
 * @returns {{ violations: Array<{ from: string, module: string, specifier?: string }>, files: string[] }}
 */
export function scanWorkerAuthImportGraph(options) {
  const repoRoot = options.repoRoot;
  const entryPaths = options.entryPaths ?? WORKER_AUTH_IMPORT_GUARD_ENTRY_PATHS;
  const visited = new Set();
  const queue = [...entryPaths];
  /** @type {Array<{ from: string, module: string, specifier?: string }>} */
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
    const { specifiers, interpolatedDynamicImportCount, nonLiteralDynamicImportCount } =
      extractImportSpecifiersFromSource(current, source);

    for (let i = 0; i < interpolatedDynamicImportCount; i += 1) {
      violations.push({
        from: current,
        module: "<interpolated-dynamic-import>",
        specifier: "import(`...${...}`)",
      });
    }
    for (let i = 0; i < nonLiteralDynamicImportCount; i += 1) {
      violations.push({
        from: current,
        module: "<non-literal-dynamic-import>",
        specifier: "import(non-literal)",
      });
    }

    for (const spec of specifiers) {
      if (!spec.startsWith(".") && !spec.startsWith("..")) {
        if (spec.startsWith("#") || spec.startsWith("/")) {
          violations.push({ from: current, module: spec, specifier: spec });
        }
        continue;
      }
      const resolved = resolveRelativeModule(repoRoot, current, spec);
      if (!resolved) {
        violations.push({ from: current, module: spec, specifier: spec });
        continue;
      }
      if (isForbiddenWorkerProductionAuthDependency(resolved)) {
        violations.push({ from: current, module: resolved, specifier: spec });
      }
      if (!visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return { violations, files: [...visited] };
}

/**
 * @param {string} repoRoot
 * @returns {{ violations: Array<{ from: string, module: string, specifier?: string }>, files: string[] }}
 */
export function assertWorkerProductionAuthImportGraph(repoRoot) {
  const { violations, files } = scanWorkerAuthImportGraph({ repoRoot });
  const filtered = violations.filter((v) => {
    if (v.module.startsWith("<")) {
      return true;
    }
    if (v.specifier?.startsWith("#") || v.specifier?.startsWith("/")) {
      return true;
    }
    return isForbiddenWorkerProductionAuthDependency(v.module);
  });
  return { violations: filtered, files };
}
