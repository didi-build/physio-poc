import type {
  SqlBindings,
  SqlStoragePort,
  SqlValue,
} from "../../src/storage/ports/sql-storage.js";

export type CountingSqlStorage = {
  sql: SqlStoragePort;
  pendingConsentSelectCount: () => number;
  resetPendingConsentSelectCount: () => void;
};

function isPendingConsentSelect(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
  return (
    normalized.startsWith("select") && normalized.includes("physio_mcp_pending_consent")
  );
}

export function wrapSqlStorageWithPendingSelectCounter(
  inner: SqlStoragePort,
): CountingSqlStorage {
  let pendingConsentSelectCount = 0;
  const sql: SqlStoragePort = {
    run: (statement, bindings) => inner.run(statement, bindings),
    all: <T extends Record<string, SqlValue>>(
      statement: string,
      bindings?: SqlBindings,
    ) => inner.all<T>(statement, bindings),
    first: <T extends Record<string, SqlValue>>(
      statement: string,
      bindings?: SqlBindings,
    ) => {
      if (isPendingConsentSelect(statement)) {
        pendingConsentSelectCount += 1;
      }
      return inner.first<T>(statement, bindings);
    },
  };
  return {
    sql,
    pendingConsentSelectCount: () => pendingConsentSelectCount,
    resetPendingConsentSelectCount: () => {
      pendingConsentSelectCount = 0;
    },
  };
}
