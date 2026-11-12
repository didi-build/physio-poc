import type {
  SqlBatchStatement,
  SqlStoragePort,
} from "../../src/storage/ports/sql-storage.js";

export type BatchInterleaveOptions = {
  shouldHook: (statements: readonly SqlBatchStatement[]) => boolean;
  runCompetingWrite: () => Promise<void>;
  once?: boolean;
};

export function wrapSqlStorageWithBeforeBatchHook(
  inner: SqlStoragePort,
  options: BatchInterleaveOptions,
): SqlStoragePort {
  let hooked = false;
  return {
    run: (statement, bindings) => inner.run(statement, bindings),
    all: (statement, bindings) => inner.all(statement, bindings),
    first: (statement, bindings) => inner.first(statement, bindings),
    batch: async (statements) => {
      const runHook = options.shouldHook(statements) && (!options.once || !hooked);
      if (runHook) {
        hooked = true;
        await options.runCompetingWrite();
      }
      return inner.batch(statements);
    },
  };
}

export function batchIncludesSavePublishedVersion(
  statements: readonly SqlBatchStatement[],
): boolean {
  return statements.some(
    (statement) =>
      statement.sql.includes("UPDATE routines SET published_version = ?") &&
      statement.sql.includes("WHERE id = ? AND published_version = ?"),
  );
}

export function batchIncludesSaveFrozenCopy(
  statements: readonly SqlBatchStatement[],
): boolean {
  return statements.some(
    (statement) =>
      statement.sql.includes("INSERT INTO practitioner_routines") &&
      statement.sql.includes("FROM routines r"),
  );
}

export function batchIncludesReplaceSavedCopyFromPublished(
  statements: readonly SqlBatchStatement[],
): boolean {
  return statements.some(
    (statement) =>
      statement.sql.includes("UPDATE practitioner_routines") &&
      statement.sql.includes("SET source_routine_version_id = ?") &&
      statement.minRowsAffected === 1,
  );
}

export function batchIncludesRoutinePublishedVersionGuard(
  statements: readonly SqlBatchStatement[],
): boolean {
  return statements.some(
    (statement) =>
      statement.sql.includes(
        "UPDATE routines SET draft_updated_at = draft_updated_at",
      ) &&
      statement.sql.includes("WHERE id = ? AND published_version = ?") &&
      statement.minRowsAffected === 1,
  );
}
