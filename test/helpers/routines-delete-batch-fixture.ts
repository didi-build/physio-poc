import { SqlBatchGuardError } from "../../src/storage/errors/sql-batch-error.js";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import {
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
} from "../../src/storage/repositories/routines.js";

/** Forces deleteCopy through the real parent minRowsAffected guard with a wrong practitioner id. */
export function installRealStaleDeleteCopyFixture(
  wrongPractitionerId: string,
): () => void {
  const original = PractitionerRoutinesRepository.prototype.deleteCopy;
  PractitionerRoutinesRepository.prototype.deleteCopy = async function (
    practitionerId: string,
    routineId: string,
  ) {
    const copy = await this.findForPractitioner(practitionerId, routineId);
    if (!copy) {
      return false;
    }
    const statements = this.buildDeleteCopyBatchStatements(
      copy.id,
      wrongPractitionerId,
    );
    try {
      const sql = (this as unknown as { sql: SqlStoragePort }).sql;
      await sql.batch(statements);
    } catch (error) {
      if (error instanceof SqlBatchGuardError) {
        throw new RoutineRepositoryError("Stale write", {
          code: "stale_write",
          cause: error,
        });
      }
      throw error;
    }
    return true;
  };
  return () => {
    PractitionerRoutinesRepository.prototype.deleteCopy = original;
  };
}
