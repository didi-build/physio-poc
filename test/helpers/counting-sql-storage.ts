import type {
  SqlBindings,
  SqlStoragePort,
  SqlValue,
} from "../../src/storage/ports/sql-storage.js";

export type CountingSqlStorage = {
  sql: SqlStoragePort;
  pendingConsentStoreCallCount: () => number;
  pendingConsentWriteCallCount: () => number;
  resetPendingConsentStoreCallCount: () => void;
};

function isPendingConsentStoreSql(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.includes("physio_mcp_pending_consent");
}

function isPendingConsentWriteSql(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    normalized.startsWith("insert") ||
    normalized.startsWith("update") ||
    normalized.startsWith("delete")
  );
}

function bumpPendingConsentCount(
  statement: string,
  bumpStore: () => void,
  bumpWrite: () => void,
): void {
  if (!isPendingConsentStoreSql(statement)) {
    return;
  }
  bumpStore();
  if (isPendingConsentWriteSql(statement)) {
    bumpWrite();
  }
}

export function wrapSqlStorageWithPendingSelectCounter(
  inner: SqlStoragePort,
): CountingSqlStorage {
  let pendingConsentStoreCallCount = 0;
  let pendingConsentWriteCallCount = 0;
  const bumpStore = () => {
    pendingConsentStoreCallCount += 1;
  };
  const bumpWrite = () => {
    pendingConsentWriteCallCount += 1;
  };
  const sql: SqlStoragePort = {
    run: (statement, bindings) => {
      bumpPendingConsentCount(statement, bumpStore, bumpWrite);
      return inner.run(statement, bindings);
    },
    all: <T extends Record<string, SqlValue>>(
      statement: string,
      bindings?: SqlBindings,
    ) => {
      bumpPendingConsentCount(statement, bumpStore, bumpWrite);
      return inner.all<T>(statement, bindings);
    },
    first: <T extends Record<string, SqlValue>>(
      statement: string,
      bindings?: SqlBindings,
    ) => {
      bumpPendingConsentCount(statement, bumpStore, bumpWrite);
      return inner.first<T>(statement, bindings);
    },
  };
  return {
    sql,
    pendingConsentStoreCallCount: () => pendingConsentStoreCallCount,
    pendingConsentWriteCallCount: () => pendingConsentWriteCallCount,
    resetPendingConsentStoreCallCount: () => {
      pendingConsentStoreCallCount = 0;
      pendingConsentWriteCallCount = 0;
    },
  };
}
