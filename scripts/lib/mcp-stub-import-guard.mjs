import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import ts from "typescript";

const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

/** Repo-relative entry modules for the MCP HTTP stub stack. */
export const MCP_STUB_IMPORT_GUARD_ENTRY_PATHS = [
  "src/adapters/workers/mcp/handle-mcp-http-request.ts",
];

/** Additional roots scanned for storage or non-mcp service imports. */
export const MCP_STUB_IMPORT_GUARD_EXTRA_ROOTS = ["src/app-routes.ts"];

/**
 * @param {string} repoRelativePath
 * @returns {boolean}
 */
export function isForbiddenMcpStubDependency(repoRelativePath) {
  const normalized = repoRelativePath.split(sep).join("/");
  if (normalized.startsWith("src/storage/")) {
    return true;
  }
  if (
    normalized.startsWith("src/services/") &&
    !normalized.startsWith("src/services/mcp/")
  ) {
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
 * @param {string} repoRelativePath
 * @returns {string | null}
 */
function resolveRelativeModule(repoRoot, importerRepoPath, specifierText) {
  const importerDir = dirname(importerRepoPath);
  let base = normalize(join(importerDir, specifierText)).split(sep).join("/");
  if (!base.startsWith("src/") && !base.startsWith("test/")) {
    const fromSrc = normalize(join("src", base)).split(sep).join("/");
    if (existsSync(join(repoRoot, fromSrc))) {
      base = fromSrc;
    }
  }

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
 * @param {string} basePath repo-relative path without guaranteed extension
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
 * @param {import("typescript").Node} node
 * @param {string[]} specifiers
 * @param {{ interpolated: number, nonLiteral: number }} dynamicImportPolicy
 */
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

/**
 * @param {import("typescript").Node | undefined} arg
 * @param {string[]} specifiers
 * @param {{ interpolated: number, nonLiteral: number }} dynamicImportPolicy
 */
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

/**
 * @param {string} repoRelativePath
 * @param {string} source
 * @returns {{ specifiers: string[], interpolatedDynamicImportCount: number, nonLiteralDynamicImportCount: number }}
 */
export function extractImportSpecifiersFromSource(repoRelativePath, source) {
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
      const [arg] = node.arguments;
      collectDynamicImportArgument(arg, specifiers, dynamicImportPolicy);
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
 * @param {string} repoRelativePath
 * @param {string} source
 * @returns {string[]}
 */
export function extractModuleSpecifiers(repoRelativePath, source) {
  return extractImportSpecifiersFromSource(repoRelativePath, source).specifiers;
}

/**
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {readonly string[]} options.entryPaths repo-relative
 * @param {(path: string) => string | undefined} [options.readSource]
 * @param {(importer: string, specifier: string) => string | null | undefined} [options.resolveModule]
 * @returns {{ visited: string[], violations: { module: string, importedFrom: string, specifier: string }[] }}
 */
export function scanMcpStubImportGraph(options) {
  const { repoRoot, entryPaths, readSource, resolveModule } = options;
  const read =
    readSource ??
    ((repoRelativePath) => {
      const abs = join(repoRoot, repoRelativePath);
      if (!existsSync(abs)) {
        return undefined;
      }
      return readFileSync(abs, "utf8");
    });

  const defaultResolve = (importer, specifier) => {
    if (!specifier.startsWith(".")) {
      return null;
    }
    return resolveRelativeModule(repoRoot, importer, specifier);
  };

  const resolve = resolveModule ?? defaultResolve;

  /** @type {string[]} */
  const visited = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {{ module: string, importedFrom: string, specifier: string }[]} */
  const violations = [];

  /** @type {string[]} */
  const queue = [...entryPaths];

  while (queue.length > 0) {
    const modulePath = queue.pop();
    if (!modulePath || seen.has(modulePath)) {
      continue;
    }
    seen.add(modulePath);
    visited.push(modulePath);

    if (isForbiddenMcpStubDependency(modulePath)) {
      continue;
    }

    const source = read(modulePath);
    if (source === undefined) {
      continue;
    }

    const { specifiers, interpolatedDynamicImportCount, nonLiteralDynamicImportCount } =
      extractImportSpecifiersFromSource(modulePath, source);
    for (let i = 0; i < interpolatedDynamicImportCount; i += 1) {
      violations.push({
        module: "<interpolated-dynamic-import>",
        importedFrom: modulePath,
        specifier: "import(`...${...}`)",
      });
    }
    for (let i = 0; i < nonLiteralDynamicImportCount; i += 1) {
      violations.push({
        module: "<non-literal-dynamic-import>",
        importedFrom: modulePath,
        specifier: "import(non-literal)",
      });
    }

    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) {
        continue;
      }
      const resolved = resolve(modulePath, specifier);
      if (!resolved) {
        continue;
      }
      if (isForbiddenMcpStubDependency(resolved)) {
        violations.push({
          module: resolved,
          importedFrom: modulePath,
          specifier,
        });
        continue;
      }
      if (!seen.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return { visited, violations };
}

/**
 * @param {string} repoRoot
 * @returns {{ violations: { module: string, importedFrom: string, specifier: string }[] }}
 */
export function assertProductionMcpStubImportGraph(repoRoot) {
  const entryPaths = [
    ...MCP_STUB_IMPORT_GUARD_ENTRY_PATHS,
    ...MCP_STUB_IMPORT_GUARD_EXTRA_ROOTS,
  ];
  const { violations } = scanMcpStubImportGraph({ repoRoot, entryPaths });
  return { violations };
}
