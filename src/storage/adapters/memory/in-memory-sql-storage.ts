import type {
  SqlBatchStatement,
  SqlBindings,
  SqlRunResult,
  SqlStoragePort,
  SqlValue,
} from "../../ports/sql-storage.js";
import { SqlBatchGuardError } from "../../errors/sql-batch-error.js";
import { SqlDuplicateIdError } from "../../errors/sql-duplicate-id-error.js";

type Row = Record<string, SqlValue>;

function normalizeStoredValue(value: SqlValue): SqlValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

function copyRow(row: Row): Row {
  const copy: Row = {};
  for (const [key, value] of Object.entries(row)) {
    copy[key] = value;
  }
  return copy;
}

function parseSelectWhere(
  normalized: string,
): { tableName: string; column: string; limitOne: boolean } | null {
  const match = /^SELECT .+ FROM (\w+) WHERE (\w+) = \?(?: LIMIT 1)?$/i.exec(
    normalized,
  );
  if (match) {
    return {
      tableName: match[1],
      column: match[2],
      limitOne: /LIMIT 1$/i.test(normalized),
    };
  }
  return null;
}

type WherePredicate =
  | { kind: "eq"; column: string; bindingIndex: number }
  | { kind: "is_null"; column: string };

function parseWhereClause(whereClause: string): WherePredicate[] {
  const parts = whereClause.split(/\s+AND\s+/i).map((part) => part.trim());
  const predicates: WherePredicate[] = [];
  let bindingIndex = 0;
  for (const part of parts) {
    const eqMatch = /^(\w+) = \?$/i.exec(part);
    if (eqMatch) {
      predicates.push({
        kind: "eq",
        column: eqMatch[1],
        bindingIndex,
      });
      bindingIndex += 1;
      continue;
    }
    const isNullMatch = /^(\w+) IS NULL$/i.exec(part);
    if (isNullMatch) {
      predicates.push({ kind: "is_null", column: isNullMatch[1] });
      continue;
    }
    throw new Error(`Unsupported WHERE clause in in-memory SQL: ${part}`);
  }
  return predicates;
}

function rowMatchesWhere(
  row: Row,
  predicates: WherePredicate[],
  bindings: SqlBindings,
): boolean {
  for (const predicate of predicates) {
    if (predicate.kind === "is_null") {
      if (row[predicate.column] !== null && row[predicate.column] !== undefined) {
        return false;
      }
      continue;
    }
    const expected = normalizeStoredValue(bindings[predicate.bindingIndex] ?? null);
    if (row[predicate.column] !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * Plain TypeScript fake for tests. Not SQLite; DIDI-997 adds better-sqlite3 for real SQL tests.
 * `batch()` snapshots table state and rolls back on failure. Ad hoc `run("BEGIN")` remains a no-op.
 * first() accepts only SELECT ... WHERE ... = ? LIMIT 1; all() accepts the same shape without LIMIT 1.
 */
export class InMemorySqlStorage implements SqlStoragePort {
  private readonly tables = new Map<string, Row[]>();

  async run(sql: string, bindings: SqlBindings = []): Promise<SqlRunResult> {
    return this.executeStatement(sql, bindings);
  }

  async batch(statements: readonly SqlBatchStatement[]): Promise<void> {
    if (statements.length === 0) {
      return;
    }
    const snapshot = this.snapshotTables();
    try {
      for (const statement of statements) {
        const result = await this.executeStatement(
          statement.sql,
          statement.bindings ?? [],
        );
        const minRows = statement.minRowsAffected;
        if (minRows !== undefined && result.rowsAffected < minRows) {
          throw new SqlBatchGuardError();
        }
      }
    } catch (error) {
      this.restoreTables(snapshot);
      throw error;
    }
  }

  async all<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T[]> {
    const parsed = parseSelectWhere(sql.trim().replace(/\s+/g, " "));
    if (!parsed || parsed.limitOne) {
      throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
    }
    return this.matchRows<T>(parsed.tableName, parsed.column, bindings[0]);
  }

  async first<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T | null> {
    const parsed = parseSelectWhere(sql.trim().replace(/\s+/g, " "));
    if (!parsed || !parsed.limitOne) {
      throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
    }
    const rows = this.matchRows<T>(parsed.tableName, parsed.column, bindings[0]);
    return rows[0] ?? null;
  }

  private snapshotTables(): Map<string, Row[]> {
    const snapshot = new Map<string, Row[]>();
    for (const [tableName, rows] of this.tables) {
      snapshot.set(
        tableName,
        rows.map((row) => copyRow(row)),
      );
    }
    return snapshot;
  }

  private restoreTables(snapshot: Map<string, Row[]>): void {
    this.tables.clear();
    for (const [tableName, rows] of snapshot) {
      this.tables.set(
        tableName,
        rows.map((row) => copyRow(row)),
      );
    }
  }

  private executeStatement(sql: string, bindings: SqlBindings): SqlRunResult {
    const normalized = sql.trim().replace(/\s+/g, " ");
    if (/^BEGIN$/i.test(normalized)) {
      return { rowsAffected: 0 };
    }
    if (/^COMMIT$/i.test(normalized) || /^ROLLBACK$/i.test(normalized)) {
      return { rowsAffected: 0 };
    }

    const insertMatch = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/i.exec(
      normalized,
    );
    if (insertMatch) {
      return this.executeInsert(
        insertMatch[1],
        insertMatch[2],
        insertMatch[3],
        bindings,
      );
    }

    const updateMatch = /^UPDATE (\w+) SET (.+) WHERE (.+)$/i.exec(normalized);
    if (updateMatch) {
      return this.executeUpdate(
        updateMatch[1],
        updateMatch[2],
        updateMatch[3],
        bindings,
      );
    }

    throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
  }

  private executeInsert(
    tableName: string,
    columnList: string,
    placeholderList: string,
    bindings: SqlBindings,
  ): SqlRunResult {
    const columns = columnList.split(",").map((c) => c.trim());
    const placeholders = placeholderList.split(",").map((c) => c.trim());
    if (columns.length !== placeholders.length || columns.length !== bindings.length) {
      throw new Error("INSERT column count must match bindings");
    }
    for (const placeholder of placeholders) {
      if (placeholder !== "?") {
        throw new Error("Only ? placeholders are supported in in-memory SQL");
      }
    }
    const row: Row = {};
    columns.forEach((column, index) => {
      row[column] = normalizeStoredValue(bindings[index] ?? null);
    });
    const table = this.tables.get(tableName) ?? [];
    const idColumn = columns.indexOf("id");
    if (idColumn >= 0) {
      const idValue = row.id;
      if (idValue !== null && idValue !== undefined) {
        const duplicate = table.some((existing) => existing.id === idValue);
        if (duplicate) {
          if (tableName === "programs") {
            throw new SqlDuplicateIdError(tableName, String(idValue));
          }
          throw new Error(`Duplicate id in ${tableName}: ${String(idValue)}`);
        }
      }
    }
    table.push(row);
    this.tables.set(tableName, table);
    return { rowsAffected: 1 };
  }

  private executeUpdate(
    tableName: string,
    setClause: string,
    whereClause: string,
    bindings: SqlBindings,
  ): SqlRunResult {
    const setParts = setClause.split(",").map((part) => part.trim());
    const assignments: { column: string; bindingIndex: number }[] = [];
    let bindingIndex = 0;
    for (const part of setParts) {
      const match = /^(\w+) = \?$/i.exec(part);
      if (!match) {
        throw new Error(`Unsupported SET clause in in-memory SQL: ${part}`);
      }
      assignments.push({ column: match[1], bindingIndex });
      bindingIndex += 1;
    }
    const wherePredicates = parseWhereClause(whereClause);
    for (const predicate of wherePredicates) {
      if (predicate.kind === "eq") {
        predicate.bindingIndex += bindingIndex;
      }
    }
    if (
      bindings.length !==
      bindingIndex + wherePredicates.filter((p) => p.kind === "eq").length
    ) {
      throw new Error("UPDATE binding count must match SET and WHERE placeholders");
    }

    const table = this.tables.get(tableName) ?? [];
    let rowsAffected = 0;
    for (const row of table) {
      if (!rowMatchesWhere(row, wherePredicates, bindings)) {
        continue;
      }
      for (const assignment of assignments) {
        row[assignment.column] = normalizeStoredValue(
          bindings[assignment.bindingIndex] ?? null,
        );
      }
      rowsAffected += 1;
    }
    this.tables.set(tableName, table);
    return { rowsAffected };
  }

  private matchRows<T extends Record<string, SqlValue>>(
    tableName: string,
    column: string,
    needle: SqlValue | undefined,
  ): T[] {
    const table = this.tables.get(tableName) ?? [];
    return table
      .filter((row) => row[column] === needle)
      .map((row) => copyRow(row) as T);
  }
}
