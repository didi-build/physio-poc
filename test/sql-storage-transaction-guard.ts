import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** Roots scanned for forbidden raw transaction SQL in service and repository code. */
export const TRANSACTION_GUARD_SCAN_ROOTS = [
  join(import.meta.dirname, "..", "src", "services"),
  join(import.meta.dirname, "..", "src", "storage", "repositories"),
] as const;

/**
 * Paths under a directory named `migrations` are excluded (Node test migration runner only;
 * not service/repository code; DIDI-1101 does not cover applyMigration).
 */
export function isExcludedFromTransactionGuardScan(absolutePath: string): boolean {
  const segments = absolutePath.split(/[/\\]/);
  return segments.includes("migrations");
}

/** Case-insensitive match on BEGIN, COMMIT, ROLLBACK inside run("...") strings. */
export function rawSqlTransactionControlPattern(): RegExp {
  return /\b(await\s+)?(this\.)?(sql\.)?run\(\s*["'](BEGIN|COMMIT|ROLLBACK)["']/i;
}

export type TransactionGuardScanOptions = {
  roots?: readonly string[];
  recursive?: boolean;
  pattern?: RegExp;
};

export function listTransactionGuardScanFiles(
  options: TransactionGuardScanOptions = {},
): string[] {
  const roots = options.roots ?? TRANSACTION_GUARD_SCAN_ROOTS;
  const recursive = options.recursive ?? true;
  const files: string[] = [];
  for (const root of roots) {
    if (recursive) {
      collectTsFilesRecursive(root, root, files);
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

function collectTsFilesRecursive(root: string, dir: string, files: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (isExcludedFromTransactionGuardScan(absolute)) {
      continue;
    }
    if (entry.isDirectory()) {
      collectTsFilesRecursive(root, absolute, files);
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
  const pattern = options.pattern ?? rawSqlTransactionControlPattern();
  const violations: { file: string; source: string }[] = [];
  for (const file of listTransactionGuardScanFiles(options)) {
    const source = readFileSync(file, "utf8");
    if (pattern.test(source)) {
      violations.push({ file, source });
    }
  }
  return violations;
}

export function relativeFromRepoRoot(absolutePath: string): string {
  return relative(join(import.meta.dirname, ".."), absolutePath);
}
