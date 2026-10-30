import {
  programPath,
  programRestorePath,
  programRowDuplicatePath,
  programRowLibraryUpdateApplyPath,
  programRowLibraryUpdateKeepPath,
  programRowPath,
  programRowsPath,
  programRowsReorderPath,
  programsDeletedListPath,
  PROGRAMS_API_BASE,
} from "../../src/programs-api-paths.js";
import { testOpaqueEntityId } from "./opaque-test-ids.js";

export type ProgramBuilderHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

const EXAMPLE_PROGRAM_ID = testOpaqueEntityId("route-table-program");
const EXAMPLE_ROW_ID = testOpaqueEntityId("route-table-row");

export function programBuilderHttpRouteCases(
  programId: string = EXAMPLE_PROGRAM_ID,
  rowId: string = EXAMPLE_ROW_ID,
): readonly ProgramBuilderHttpRouteCase[] {
  return [
    { method: "GET", path: PROGRAMS_API_BASE },
    { method: "POST", path: PROGRAMS_API_BASE },
    { method: "GET", path: programsDeletedListPath() },
    { method: "GET", path: programPath(programId) },
    { method: "PATCH", path: programPath(programId) },
    { method: "DELETE", path: programPath(programId) },
    { method: "POST", path: programRestorePath(programId) },
    { method: "POST", path: programRowsPath(programId) },
    { method: "PATCH", path: programRowsReorderPath(programId) },
    { method: "PATCH", path: programRowPath(programId, rowId) },
    { method: "DELETE", path: programRowPath(programId, rowId) },
    { method: "POST", path: programRowDuplicatePath(programId, rowId) },
    { method: "POST", path: programRowLibraryUpdateApplyPath(programId, rowId) },
    { method: "POST", path: programRowLibraryUpdateKeepPath(programId, rowId) },
  ];
}

export function programBuilderMutatingHttpRouteCases(
  programId: string = EXAMPLE_PROGRAM_ID,
  rowId: string = EXAMPLE_ROW_ID,
): readonly ProgramBuilderHttpRouteCase[] {
  return programBuilderHttpRouteCases(programId, rowId).filter((routeCase) =>
    ["POST", "PUT", "PATCH", "DELETE"].includes(routeCase.method),
  );
}
