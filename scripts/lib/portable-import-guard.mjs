import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

const PLATFORM_PREFIXES = ["entry/", "adapters/node/", "adapters/workers/"];

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
    if (
      text.includes("/entry/") ||
      text.endsWith("/entry") ||
      text === "../entry/node.js"
    ) {
      violations.push(`${kind} imports src/entry: ${text}`);
      return;
    }
    if (text.startsWith(".")) {
      return;
    }
    violations.push(`${kind} non-relative import: ${text}`);
  }

  function visit(node) {
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
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "globalThis" &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "process"
    ) {
      violations.push("globalThis process access");
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
