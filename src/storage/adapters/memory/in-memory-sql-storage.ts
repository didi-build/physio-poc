import type {
  SqlBatchStatement,
  SqlBindings,
  SqlRunResult,
  SqlStoragePort,
  SqlValue,
} from "../../ports/sql-storage.js";
import { SqlBatchGuardError } from "../../errors/sql-batch-error.js";
import { SqlDuplicateIdError } from "../../errors/sql-duplicate-id-error.js";
import {
  SQL_BATCH_MIN_ROWS_GUARD_ENSURE,
  SQL_BATCH_MIN_ROWS_GUARD_SQL,
  expandSqlBatchStatementsWithMinRowsGuards,
} from "../../sql-batch-min-rows-guard.js";

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

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
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
  | { kind: "is_null"; column: string }
  | {
      kind: "exists_exercise_request";
      requestBindingIndex: number;
      exerciseBindingIndex: number;
    };

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
    const existsMatch =
      /^EXISTS \(SELECT 1 FROM exercise_requests er WHERE er\.id = \? AND \(er\.exercise_id IS NULL OR er\.exercise_id = \?\)\)$/i.exec(
        part,
      );
    if (existsMatch) {
      predicates.push({
        kind: "exists_exercise_request",
        requestBindingIndex: bindingIndex,
        exerciseBindingIndex: bindingIndex + 1,
      });
      bindingIndex += 2;
      continue;
    }
    throw new Error(`Unsupported WHERE clause in in-memory SQL: ${part}`);
  }
  return predicates;
}

function assertBatchAllowsSql(sql: string): void {
  const normalized = normalizeSql(sql);
  if (/^(BEGIN|COMMIT|ROLLBACK)(\s|$)/i.test(normalized)) {
    throw new Error("Transaction control SQL is not allowed inside batch");
  }
  if (/^SAVEPOINT\b/i.test(normalized) || /^RELEASE\b/i.test(normalized)) {
    throw new Error("Savepoint SQL is not allowed inside batch");
  }
}

/**
 * Plain TypeScript fake for tests. Not SQLite; DIDI-997 adds better-sqlite3 for real SQL tests.
 * `batch()` snapshots table state and rolls back on failure. Ad hoc `run("BEGIN")` remains a no-op.
 * Supports INSERT ... ON CONFLICT DO UPDATE and SET col = NULL for repository batch statements.
 */
export class InMemorySqlStorage implements SqlStoragePort {
  private readonly tables = new Map<string, Row[]>();
  private lastRowsAffected = 0;
  private tail: Promise<void> = Promise.resolve();

  async run(sql: string, bindings: SqlBindings = []): Promise<SqlRunResult> {
    return this.withStorageLock(() => this.executeStatement(sql, bindings));
  }

  async batch(statements: readonly SqlBatchStatement[]): Promise<void> {
    if (statements.length === 0) {
      return;
    }
    return this.withStorageLock(() => {
      const snapshot = this.snapshotTables();
      this.executeStatement(SQL_BATCH_MIN_ROWS_GUARD_ENSURE, []);
      const expanded = expandSqlBatchStatementsWithMinRowsGuards(statements);
      try {
        for (const statement of expanded) {
          assertBatchAllowsSql(statement.sql);
          this.executeStatement(statement.sql, statement.bindings);
        }
      } catch (error) {
        this.restoreTables(snapshot);
        throw error;
      }
    });
  }

  async all<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T[]> {
    return this.withStorageLock(() => {
      const parsed = parseSelectWhere(normalizeSql(sql));
      if (!parsed || parsed.limitOne) {
        throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
      }
      return this.matchRows<T>(parsed.tableName, parsed.column, bindings[0]);
    });
  }

  async first<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T | null> {
    return this.withStorageLock(() => {
      const parsed = parseSelectWhere(normalizeSql(sql));
      if (!parsed || !parsed.limitOne) {
        throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
      }
      const rows = this.matchRows<T>(parsed.tableName, parsed.column, bindings[0]);
      return rows[0] ?? null;
    });
  }

  private async withStorageLock<T>(fn: () => T): Promise<T> {
    let release!: () => void;
    const wait = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await wait;
    try {
      return fn();
    } finally {
      release();
    }
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
    const normalized = normalizeSql(sql);
    if (normalized === normalizeSql(SQL_BATCH_MIN_ROWS_GUARD_SQL)) {
      const minRows = Number(bindings[0] ?? 0);
      if (this.lastRowsAffected < minRows) {
        throw new SqlBatchGuardError();
      }
      const table = this.tables.get("__sql_batch_min_rows_guard") ?? [];
      table.push({ v: 1 });
      this.tables.set("__sql_batch_min_rows_guard", table);
      return { rowsAffected: 1 };
    }

    if (normalized === normalizeSql(SQL_BATCH_MIN_ROWS_GUARD_ENSURE)) {
      if (!this.tables.has("__sql_batch_min_rows_guard")) {
        this.tables.set("__sql_batch_min_rows_guard", []);
      }
      return { rowsAffected: 0 };
    }
    if (/^BEGIN$/i.test(normalized)) {
      return { rowsAffected: 0 };
    }
    if (/^COMMIT$/i.test(normalized) || /^ROLLBACK$/i.test(normalized)) {
      return { rowsAffected: 0 };
    }

    const createMatch = /^CREATE TABLE (\w+) \(.+\)$/i.exec(normalized);
    if (createMatch) {
      if (!this.tables.has(createMatch[1])) {
        this.tables.set(createMatch[1], []);
      }
      return { rowsAffected: 0 };
    }

    const upsertMatch =
      /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\) ON CONFLICT\(([^)]+)\) DO UPDATE SET (.+)$/i.exec(
        normalized,
      );
    if (upsertMatch) {
      const result = this.executeUpsert(
        upsertMatch[1],
        upsertMatch[2],
        upsertMatch[3],
        upsertMatch[4],
        upsertMatch[5],
        bindings,
      );
      this.lastRowsAffected = result.rowsAffected;
      return result;
    }

    const insertMatch = /^INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)$/i.exec(
      normalized,
    );
    if (insertMatch) {
      const result = this.executeInsert(
        insertMatch[1],
        insertMatch[2],
        insertMatch[3],
        bindings,
      );
      this.lastRowsAffected = result.rowsAffected;
      return result;
    }

    const updateMatch = /^UPDATE (\w+) SET (.+) WHERE (.+)$/i.exec(normalized);
    if (updateMatch) {
      const result = this.executeUpdate(
        updateMatch[1],
        updateMatch[2],
        updateMatch[3],
        bindings,
      );
      this.lastRowsAffected = result.rowsAffected;
      return result;
    }

    throw new Error(`Unsupported SQL in in-memory adapter: ${sql}`);
  }

  private executeUpsert(
    tableName: string,
    columnList: string,
    _placeholderList: string,
    conflictColumns: string,
    setClause: string,
    bindings: SqlBindings,
  ): SqlRunResult {
    const columns = columnList.split(",").map((c) => c.trim());
    const conflictKeys = conflictColumns.split(",").map((c) => c.trim());
    const row: Row = {};
    columns.forEach((column, index) => {
      row[column] = normalizeStoredValue(bindings[index] ?? null);
    });
    const table = this.tables.get(tableName) ?? [];
    const existingIndex = table.findIndex((existing) =>
      conflictKeys.every((key) => existing[key] === row[key]),
    );
    if (existingIndex < 0) {
      table.push(row);
      this.tables.set(tableName, table);
      return { rowsAffected: 1 };
    }
    const existing = table[existingIndex]!;
    const setParts = setClause.split(",").map((part) => part.trim());
    for (const part of setParts) {
      const excludedMatch = /^(\w+) = excluded\.(\w+)$/i.exec(part);
      if (!excludedMatch) {
        throw new Error(`Unsupported upsert SET in in-memory SQL: ${part}`);
      }
      existing[excludedMatch[1]] = row[excludedMatch[2] ?? excludedMatch[1]];
    }
    this.tables.set(tableName, table);
    return { rowsAffected: 1 };
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

  private rowMatchesWhere(
    row: Row,
    predicates: WherePredicate[],
    bindings: SqlBindings,
    bindingOffset = 0,
  ): boolean {
    for (const predicate of predicates) {
      if (predicate.kind === "exists_exercise_request") {
        const requestId = bindings[bindingOffset + predicate.requestBindingIndex];
        const exerciseId = bindings[bindingOffset + predicate.exerciseBindingIndex];
        const requests = this.tables.get("exercise_requests") ?? [];
        const request = requests.find((entry) => entry.id === requestId);
        if (!request) {
          return false;
        }
        const storedExerciseId = request.exercise_id;
        if (
          storedExerciseId !== null &&
          storedExerciseId !== undefined &&
          storedExerciseId !== exerciseId
        ) {
          return false;
        }
        continue;
      }
      if (predicate.kind === "is_null") {
        if (row[predicate.column] !== null && row[predicate.column] !== undefined) {
          return false;
        }
        continue;
      }
      const expected = normalizeStoredValue(
        bindings[bindingOffset + predicate.bindingIndex] ?? null,
      );
      if (row[predicate.column] !== expected) {
        return false;
      }
    }
    return true;
  }

  private executeUpdate(
    tableName: string,
    setClause: string,
    whereClause: string,
    bindings: SqlBindings,
  ): SqlRunResult {
    const setParts = setClause.split(",").map((part) => part.trim());
    const assignments: {
      column: string;
      bindingIndex: number | null;
      nullValue: boolean;
    }[] = [];
    let bindingIndex = 0;
    for (const part of setParts) {
      const nullMatch = /^(\w+) = NULL$/i.exec(part);
      if (nullMatch) {
        assignments.push({ column: nullMatch[1], bindingIndex: null, nullValue: true });
        continue;
      }
      const match = /^(\w+) = \?$/i.exec(part);
      if (!match) {
        throw new Error(`Unsupported SET clause in in-memory SQL: ${part}`);
      }
      assignments.push({ column: match[1], bindingIndex, nullValue: false });
      bindingIndex += 1;
    }
    const wherePredicates = parseWhereClause(whereClause);
    const setBindingCount = bindingIndex;
    const eqWhereCount = wherePredicates.filter((p) => p.kind === "eq").length;
    const existsCount = wherePredicates.filter(
      (p) => p.kind === "exists_exercise_request",
    ).length;
    if (bindings.length !== setBindingCount + eqWhereCount + existsCount * 2) {
      throw new Error("UPDATE binding count must match SET and WHERE placeholders");
    }

    const table = this.tables.get(tableName) ?? [];
    let rowsAffected = 0;
    for (const row of table) {
      if (!this.rowMatchesWhere(row, wherePredicates, bindings, setBindingCount)) {
        continue;
      }
      for (const assignment of assignments) {
        if (assignment.nullValue) {
          row[assignment.column] = null;
          continue;
        }
        row[assignment.column] = normalizeStoredValue(
          bindings[assignment.bindingIndex ?? 0] ?? null,
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
