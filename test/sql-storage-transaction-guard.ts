import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** Roots scanned for forbidden raw transaction SQL in service and repository code. */
export const TRANSACTION_GUARD_SCAN_ROOTS = [
  join(import.meta.dirname, "..", "src", "services"),
  join(import.meta.dirname, "..", "src", "storage", "repositories"),
] as const;

const REPO_ROOT = join(import.meta.dirname, "..");
const STORAGE_MIGRATIONS_ROOT = join(REPO_ROOT, "src", "storage", "migrations");

/**
 * Only the Node test migration runner under src/storage/migrations is excluded.
 * A nested folder named migrations elsewhere remains in scope.
 */
export function isExcludedFromTransactionGuardScan(absolutePath: string): boolean {
  const normalized = absolutePath.replace(/\\/g, "/");
  const migrationsRoot = STORAGE_MIGRATIONS_ROOT.replace(/\\/g, "/");
  return normalized === migrationsRoot || normalized.startsWith(`${migrationsRoot}/`);
}

/**
 * Static scan for raw transaction control in services and repositories.
 * This is defence in depth only: runtime batch adapters reject BEGIN, COMMIT,
 * ROLLBACK, and SAVEPOINT inside batch() regardless of this scan.
 *
 * Known gaps (not flagged today): run(beginVar, []), batch(stmts) with a
 * variable array, template interpolation in sql strings, and END /
 * END TRANSACTION (SQLite COMMIT aliases). False positives: comments containing
 * run("BEGIN"), any single-argument run(identifier), and trigger SQL with BEGIN.
 */
export function rawSqlTransactionControlPatterns(): RegExp[] {
  const keyword =
    "(BEGIN(?:\\s+(?:IMMEDIATE|DEFERRED|EXCLUSIVE|TRANSACTION))?|COMMIT|ROLLBACK|SAVEPOINT\\b|RELEASE\\s+SAVEPOINT)";
  return [
    new RegExp(
      String.raw`\b(await\s+)?(this\.)?(sql\.)?run\(\s*(["'` +
        "`" +
        String.raw`])[^"'` +
        "`" +
        String.raw`]*\b${keyword}\b`,
      "i",
    ),
    new RegExp(
      String.raw`\b(await\s+)?(this\.)?(sql\.)?run\(\s*[a-zA-Z_$][\w$]*\s*\)`,
      "i",
    ),
    new RegExp(
      String.raw`\bbatch\s*\(\s*\[\s*\{[^}]*\bsql\s*:\s*(["'` +
        "`" +
        String.raw`])[^"'` +
        "`" +
        String.raw`]*\b${keyword}\b`,
      "i",
    ),
  ];
}

export function rawSqlTransactionControlPattern(): RegExp {
  return rawSqlTransactionControlPatterns()[0];
}

export type TransactionGuardScanOptions = {
  roots?: readonly string[];
  recursive?: boolean;
  patterns?: RegExp[];
};

export function listTransactionGuardScanFiles(
  options: TransactionGuardScanOptions = {},
): string[] {
  const roots = options.roots ?? TRANSACTION_GUARD_SCAN_ROOTS;
  const recursive = options.recursive ?? true;
  const files: string[] = [];
  for (const root of roots) {
    if (recursive) {
      collectTsFilesRecursive(root, files);
    } else {
      for (const name of readdirSync(root)) {
        const absolute = join(root, name);
        if (name.endsWith(".ts") && !isExcludedFromTransactionGuardScan(absolute)) {
          files.push(absolute);
        }
      }
    }
  }
  return files.sort();
}

function collectTsFilesRecursive(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (isExcludedFromTransactionGuardScan(absolute)) {
      continue;
    }
    if (entry.isDirectory()) {
      collectTsFilesRecursive(absolute, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(absolute);
    }
  }
}

export function findRawSqlTransactionControlViolations(
  options: TransactionGuardScanOptions = {},
): { file: string; source: string }[] {
  const patterns = options.patterns ?? rawSqlTransactionControlPatterns();
  const violations: { file: string; source: string }[] = [];
  for (const file of listTransactionGuardScanFiles(options)) {
    const source = readFileSync(file, "utf8");
    if (patterns.some((pattern) => pattern.test(source))) {
      violations.push({ file, source });
    }
  }
  return violations;
}

export function relativeFromRepoRoot(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath);
}
