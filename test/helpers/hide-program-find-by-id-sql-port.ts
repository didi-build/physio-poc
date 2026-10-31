import type {
  SqlBindings,
  SqlStoragePort,
  SqlValue,
} from "../../src/storage/ports/sql-storage.js";

/**
 * Test double: hides an existing program row from SELECT ... FROM programs WHERE id = ? LIMIT 1
 * so service pre-checks miss, while INSERT still hits the real row (duplicate id at create).
 */
export function hideProgramFindByIdSqlPort(
  inner: SqlStoragePort,
  hiddenProgramId: string,
): SqlStoragePort {
  return {
    run(sql: string, bindings: SqlBindings = []) {
      return inner.run(sql, bindings);
    },
    all<T extends Record<string, SqlValue>>(sql: string, bindings: SqlBindings = []) {
      return inner.all<T>(sql, bindings);
    },
    first<T extends Record<string, SqlValue>>(sql: string, bindings: SqlBindings = []) {
      const normalized = sql.trim().replace(/\s+/g, " ");
      if (
        bindings[0] === hiddenProgramId &&
        /FROM programs WHERE id = \? LIMIT 1$/i.test(normalized)
      ) {
        return Promise.resolve(null);
      }
      return inner.first<T>(sql, bindings);
    },
  };
}
