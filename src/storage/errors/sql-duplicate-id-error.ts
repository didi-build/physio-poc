export class SqlDuplicateIdError extends Error {
  readonly tableName: string;
  readonly duplicateId: string | null;

  constructor(tableName: string, duplicateId: string | null = null) {
    const detail =
      duplicateId !== null
        ? `Duplicate id in ${tableName}: ${duplicateId}`
        : `Duplicate id in ${tableName}`;
    super(detail);
    this.name = "SqlDuplicateIdError";
    this.tableName = tableName;
    this.duplicateId = duplicateId;
  }
}

export function isSqlDuplicateIdError(error: unknown): error is SqlDuplicateIdError {
  return error instanceof SqlDuplicateIdError;
}
