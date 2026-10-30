import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import ts from "typescript";

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const PLATFORM_PREFIXES = ["entry/", "adapters/node/", "adapters/workers/"];

const UI_SOURCE_PREFIX = "src/ui/";

/** @type {readonly string[]} */
const UI_PACKAGE_ALLOWLIST = ["react", "react-dom", "react-router-dom"];

/** Bare Node built-ins and other runtime modules that must not be imported in UI. */
const UI_DISALLOWED_BARE_MODULES = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "workerd",
  "zlib",
]);

/**
 * @param {string} repoRelativePath
 * @returns {boolean}
 */
function isUiSourceFile(repoRelativePath) {
  return repoRelativePath.startsWith(UI_SOURCE_PREFIX);
}

/**
 * @param {string} specifierText
 * @returns {boolean}
 */
function isAllowedUiModuleSpecifier(specifierText) {
  if (specifierText.includes("..")) {
    return false;
  }
  return UI_PACKAGE_ALLOWLIST.some(
    (pkg) => specifierText === pkg || specifierText.startsWith(`${pkg}/`),
  );
}

/**
 * @param {string} specifierText
 * @returns {boolean}
 */
function isDisallowedBareUiModule(specifierText) {
  if (specifierText.includes("/") || specifierText.startsWith("@")) {
    return false;
  }
  return UI_DISALLOWED_BARE_MODULES.has(specifierText);
}

/**
 * Runtime or vendor platform modules that must not appear outside entry/adapters.
 * @param {string} specifierText
 * @returns {boolean}
 */
function isPlatformModuleSpecifier(specifierText) {
  if (specifierText.startsWith("node:")) {
    return true;
  }
  if (specifierText.startsWith("cloudflare:")) {
    return true;
  }
  if (specifierText.startsWith("@cloudflare/")) {
    return true;
  }
  if (specifierText === "cloudflare" || specifierText.startsWith("cloudflare/")) {
    return true;
  }
  if (specifierText === "wrangler" || specifierText.startsWith("wrangler/")) {
    return true;
  }
  return false;
}

/**
 * @param {string} srcRoot absolute path to src/
 * @returns {string[]} repo-relative paths like src/http/app.ts
 */
export function listPortableSourceFiles(srcRoot) {
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = entry.slice(entry.lastIndexOf("."));
      if (!SCAN_EXTENSIONS.has(ext)) {
        continue;
      }
      const relFromSrc = relative(srcRoot, full).split(sep).join("/");
      if (PLATFORM_PREFIXES.some((prefix) => relFromSrc.startsWith(prefix))) {
        continue;
      }
      files.push(join("src", relFromSrc).split(sep).join("/"));
    }
  }

  walk(srcRoot);
  return files.sort();
}

/**
 * @param {string} importerRepoPath repo-relative path e.g. src/http/app.ts
 * @param {string} specifierText
 * @returns {string} normalized repo-relative path
 */
function resolveRelativeImport(importerRepoPath, specifierText) {
  const importerDir = dirname(importerRepoPath);
  return normalize(join(importerDir, specifierText)).split(sep).join("/");
}

/**
 * @param {string} resolvedRepoPath
 * @returns {boolean}
 */
function landsInPlatformTree(resolvedRepoPath) {
  const normalized = resolvedRepoPath.split(sep).join("/");
  let withinSrc = normalized;
  if (normalized.startsWith("src/")) {
    withinSrc = normalized.slice("src/".length);
  }
  return PLATFORM_PREFIXES.some((prefix) => {
    const directory = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
    return withinSrc === directory || withinSrc.startsWith(prefix);
  });
}

/**
 * @param {import("typescript").Expression} node
 * @returns {import("typescript").Expression}
 */
function unwrapExpression(node) {
  let current = node;
  while (true) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    break;
  }
  return current;
}

/**
 * @param {string} repoRelativePath e.g. src/http/app.ts
 * @param {string} source
 * @returns {string[]} violation messages
 */
export function findPortableViolations(repoRelativePath, source) {
  const violations = [];
  const scriptKind = scriptKindForPath(repoRelativePath);
  const sourceFile = ts.createSourceFile(
    repoRelativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  if (/^\s*\/\/\//m.test(source)) {
    violations.push("triple-slash reference directive");
  }

  function checkModuleSpecifier(specifier, kind) {
    if (!specifier) {
      return;
    }
    const text = specifier.text;
    if (text.startsWith(".")) {
      const resolved = resolveRelativeImport(repoRelativePath, text);
      if (landsInPlatformTree(resolved)) {
        violations.push(`${kind} imports platform tree: ${text} -> ${resolved}`);
      }
      return;
    }
    if (isUiSourceFile(repoRelativePath)) {
      if (isPlatformModuleSpecifier(text)) {
        violations.push(`${kind} platform module in ui: ${text}`);
        return;
      }
      if (text.includes("..")) {
        violations.push(`${kind} ui import with parent segments: ${text}`);
        return;
      }
      if (isDisallowedBareUiModule(text)) {
        violations.push(`${kind} disallowed bare module in ui: ${text}`);
        return;
      }
      if (isAllowedUiModuleSpecifier(text)) {
        return;
      }
      violations.push(`${kind} disallowed ui import: ${text}`);
      return;
    }
    violations.push(`${kind} non-relative import: ${text}`);
  }

  /**
   * @param {import("typescript").ImportTypeNode} node
   * @returns {import("typescript").StringLiteral | null}
   */
  function stringLiteralFromImportType(node) {
    const arg = node.argument;
    if (ts.isLiteralTypeNode(arg) && ts.isStringLiteral(arg.literal)) {
      return arg.literal;
    }
    if (ts.isStringLiteral(arg)) {
      return arg;
    }
    return null;
  }

  function visit(node) {
    if (ts.isImportTypeNode(node)) {
      const literal = stringLiteralFromImportType(node);
      if (literal) {
        checkModuleSpecifier(literal, "import type");
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      checkModuleSpecifier(node.moduleSpecifier, "import");
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      checkModuleSpecifier(node.moduleSpecifier, "export");
    }
    if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference;
      if (
        ts.isExternalModuleReference(ref) &&
        ref.expression &&
        ts.isStringLiteral(ref.expression)
      ) {
        checkModuleSpecifier(ref.expression, "import=");
      }
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const [arg] = node.arguments;
      if (!arg || !ts.isStringLiteral(arg)) {
        violations.push("dynamic import() must use a string literal");
      } else {
        checkModuleSpecifier(arg, "dynamic import");
      }
    }
    if (ts.isIdentifier(node) && node.text === "process") {
      violations.push("process identifier");
    }
    if (ts.isIdentifier(node) && node.text === "require") {
      violations.push("require identifier");
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "require") {
      violations.push("require property access");
    }
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "process"
    ) {
      violations.push("process string element access");
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "env") {
      const receiver = unwrapExpression(node.expression);
      if (
        ts.isMetaProperty(receiver) &&
        receiver.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        violations.push("import.meta.env access");
      }
    }
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "env"
    ) {
      const receiver = unwrapExpression(node.expression);
      if (
        ts.isMetaProperty(receiver) &&
        receiver.keywordToken === ts.SyntaxKind.ImportKeyword
      ) {
        violations.push("import.meta.env access");
      }
    }
    if (ts.isElementAccessExpression(node)) {
      const receiver = unwrapExpression(node.expression);
      if (
        ts.isIdentifier(receiver) &&
        receiver.text === "globalThis" &&
        node.argumentExpression &&
        ts.isStringLiteral(node.argumentExpression) &&
        node.argumentExpression.text === "process"
      ) {
        violations.push("globalThis process access");
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
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
 * @returns {{ files: string[], violations: { file: string, messages: string[] }[] }}
 */
export function scanPortableTree(repoRoot) {
  const srcRoot = join(repoRoot, "src");
  const files = listPortableSourceFiles(srcRoot);
  const violations = [];

  for (const file of files) {
    const abs = join(repoRoot, file);
    const source = readFileSync(abs, "utf8");
    const messages = findPortableViolations(file, source);
    if (messages.length > 0) {
      violations.push({ file, messages });
    }
  }

  return { files, violations };
}
