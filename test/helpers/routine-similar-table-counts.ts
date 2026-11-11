import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";

export async function snapshotTableCounts(
  storage: SqlStoragePort,
): Promise<Record<string, number>> {
  const tables = await storage.all<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name ASC`,
  );
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const row = await storage.first<{ c: number }>(
      `SELECT count(*) as c FROM "${table.name}"`,
    );
    counts[table.name] = row?.c ?? 0;
  }
  return counts;
}

export function assertTableCountsUnchanged(
  before: Record<string, number>,
  after: Record<string, number>,
): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if ((before[key] ?? 0) !== (after[key] ?? 0)) {
      throw new Error(
        `table ${key} row count changed: ${before[key] ?? 0} -> ${after[key] ?? 0}`,
      );
    }
  }
}
