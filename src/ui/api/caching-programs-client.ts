import type { ProgramsClient } from "./programs-client.js";
import {
  invalidateAfterProgramBuilderMutation,
  invalidateAfterProgramsListMutation,
} from "./navigation-read-cache-invalidation.js";

function withProgramsListInvalidation<T>(run: () => Promise<T>): Promise<T> {
  return run().then((result) => {
    invalidateAfterProgramsListMutation();
    return result;
  });
}

/** Pass-through GETs; mutating calls invalidate navigation read cache keys (DIDI-1185). */
export function wrapProgramsClientWithCacheInvalidation(
  inner: ProgramsClient,
): ProgramsClient {
  return {
    listPrograms: (searchQuery, originFilter, options) =>
      inner.listPrograms(searchQuery, originFilter, options),
    getProgramByCode: (programCode, options) =>
      inner.getProgramByCode(programCode, options),
    listDeletedPrograms: (options) => inner.listDeletedPrograms(options),
    getProgram: (programId, options) => inner.getProgram(programId, options),
    createProgram: (input) =>
      withProgramsListInvalidation(() => inner.createProgram(input)),
    createProgramFromRoutine: (input) =>
      inner.createProgramFromRoutine(input).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        invalidateAfterProgramsListMutation();
        return result;
      }),
    updateProgramName: (programId, name) =>
      inner.updateProgramName(programId, name).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        invalidateAfterProgramsListMutation();
        return result;
      }),
    deleteProgram: (programId) =>
      inner.deleteProgram(programId).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        invalidateAfterProgramsListMutation();
        return result;
      }),
    restoreProgram: (programId) =>
      withProgramsListInvalidation(() => inner.restoreProgram(programId)),
    addExerciseRow: (programId, body) =>
      inner.addExerciseRow(programId, body).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
    addPlaceholderRow: (programId, body) =>
      inner.addPlaceholderRow(programId, body).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
    updateRow: (programId, rowId, body) =>
      inner.updateRow(programId, rowId, body).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
    deleteRow: (programId, rowId) =>
      inner.deleteRow(programId, rowId).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
    reorderRows: (programId, orderedRowIds) =>
      inner.reorderRows(programId, orderedRowIds).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
    duplicateRow: (programId, rowId, newRowId) =>
      inner.duplicateRow(programId, rowId, newRowId).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
    applyLibraryUpdate: (programId, rowId) =>
      inner.applyLibraryUpdate(programId, rowId).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
    keepLibraryUpdate: (programId, rowId) =>
      inner.keepLibraryUpdate(programId, rowId).then((result) => {
        invalidateAfterProgramBuilderMutation(result.program.code);
        return result;
      }),
  } as ProgramsClient;
}
