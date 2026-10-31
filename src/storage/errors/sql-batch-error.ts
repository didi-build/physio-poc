export class SqlBatchGuardError extends Error {
  constructor(message = "SQL batch statement matched fewer rows than required") {
    super(message);
    this.name = "SqlBatchGuardError";
  }
}
