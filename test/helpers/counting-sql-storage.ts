import type {
  SqlBindings,
  SqlStoragePort,
  SqlValue,
} from "../../src/storage/ports/sql-storage.js";

export type CountingSqlStorage = {
  sql: SqlStoragePort;
  pendingConsentStoreCallCount: () => number;
  pendingConsentWriteCallCount: () => number;
  sqlWriteCallCount: () => number;
  resetPendingConsentStoreCallCount: () => void;
};

function isPendingConsentStoreSql(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.includes("physio_mcp_pending_consent");
}

function isWriteSql(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    normalized.startsWith("insert") ||
    normalized.startsWith("update") ||
    normalized.startsWith("delete") ||
    normalized.startsWith("replace")
  );
}

function bumpPendingConsentCount(
  statement: string,
  bumpStore: () => void,
  bumpWrite: () => void,
  bumpAnyWrite: () => void,
): void {
  if (isWriteSql(statement)) {
    bumpAnyWrite();
  }
  if (!isPendingConsentStoreSql(statement)) {
    return;
  }
  bumpStore();
  if (isWriteSql(statement)) {
    bumpWrite();
  }
}

export function wrapSqlStorageWithPendingSelectCounter(
  inner: SqlStoragePort,
): CountingSqlStorage {
  let pendingConsentStoreCallCount = 0;
  let pendingConsentWriteCallCount = 0;
  let sqlWriteCallCount = 0;
  const bumpStore = () => {
    pendingConsentStoreCallCount += 1;
  };
  const bumpWrite = () => {
    pendingConsentWriteCallCount += 1;
  };
  const bumpAnyWrite = () => {
    sqlWriteCallCount += 1;
  };
  const sql: SqlStoragePort = {
    run: (statement, bindings) => {
      bumpPendingConsentCount(statement, bumpStore, bumpWrite, bumpAnyWrite);
      return inner.run(statement, bindings);
    },
    all: <T extends Record<string, SqlValue>>(
      statement: string,
      bindings?: SqlBindings,
    ) => {
      bumpPendingConsentCount(statement, bumpStore, bumpWrite, bumpAnyWrite);
      return inner.all<T>(statement, bindings);
    },
    first: <T extends Record<string, SqlValue>>(
      statement: string,
      bindings?: SqlBindings,
    ) => {
      bumpPendingConsentCount(statement, bumpStore, bumpWrite, bumpAnyWrite);
      return inner.first<T>(statement, bindings);
    },
    batch: async (statements) => {
      for (const statement of statements) {
        bumpPendingConsentCount(statement.sql, bumpStore, bumpWrite, bumpAnyWrite);
      }
      return inner.batch(statements);
    },
  };
  return {
    sql,
    pendingConsentStoreCallCount: () => pendingConsentStoreCallCount,
    pendingConsentWriteCallCount: () => pendingConsentWriteCallCount,
    sqlWriteCallCount: () => sqlWriteCallCount,
    resetPendingConsentStoreCallCount: () => {
      pendingConsentStoreCallCount = 0;
      pendingConsentWriteCallCount = 0;
      sqlWriteCallCount = 0;
    },
  };
}
