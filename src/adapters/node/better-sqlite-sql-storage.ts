import Database from "better-sqlite3";
import type {
  SqlBindings,
  SqlRunResult,
  SqlStoragePort,
  SqlValue,
} from "../../storage/ports/sql-storage.js";

export class NestedSqlTransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NestedSqlTransactionError";
  }
}

function normalizeBinding(value: SqlValue): SqlValue {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

/**
 * SQLite-backed SqlStoragePort for local tests and the Node adapter path.
 */
export class BetterSqliteStorage implements SqlStoragePort {
  private transactionDepth = 0;

  constructor(private readonly db: Database.Database) {}

  static openInMemory(): BetterSqliteStorage {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    return new BetterSqliteStorage(db);
  }

  static openFile(path: string): BetterSqliteStorage {
    const db = new Database(path);
    db.pragma("foreign_keys = ON");
    return new BetterSqliteStorage(db);
  }

  execScript(sql: string): void {
    this.db.exec(sql);
  }

  nativeDatabase(): Database.Database {
    return this.db;
  }

  async run(sql: string, bindings: SqlBindings = []): Promise<SqlRunResult> {
    const normalized = sql.trim().replace(/\s+/g, " ");
    if (/^BEGIN$/i.test(normalized)) {
      if (this.transactionDepth > 0) {
        throw new NestedSqlTransactionError(
          "Nested SQL transactions are not supported",
        );
      }
      this.transactionDepth += 1;
    } else if (/^COMMIT$/i.test(normalized) || /^ROLLBACK$/i.test(normalized)) {
      if (this.transactionDepth === 0) {
        throw new NestedSqlTransactionError(
          "COMMIT or ROLLBACK without an open transaction",
        );
      }
      this.transactionDepth -= 1;
    }
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...bindings.map(normalizeBinding));
    return { rowsAffected: result.changes };
  }

  async all<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...bindings.map(normalizeBinding)) as T[];
  }

  async first<T extends Record<string, SqlValue>>(
    sql: string,
    bindings: SqlBindings = [],
  ): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...bindings.map(normalizeBinding)) as T | undefined;
    return row ?? null;
  }

  close(): void {
    this.db.close();
  }

  foreignKeysEnabled(): boolean {
    const row = this.db.pragma("foreign_keys", { simple: true }) as number;
    return row === 1;
  }
}
