import {
  programPath,
  programByCodePath,
  programRestorePath,
  programRowDuplicatePath,
  programRowLibraryUpdateApplyPath,
  programRowLibraryUpdateKeepPath,
  programRowPath,
  programRowsPath,
  programRowsReorderPath,
  programsDeletedListPath,
  programsFromRoutinePath,
  routineSentProgramsPath,
  PROGRAMS_API_BASE,
} from "./program-builder-http-paths.js";
import { testOpaqueEntityId } from "./opaque-test-ids.js";

export type ProgramBuilderHttpRouteCase = {
  readonly method: string;
  readonly path: string;
};

const EXAMPLE_PROGRAM_ID = testOpaqueEntityId("route-table-program");
const EXAMPLE_ROW_ID = testOpaqueEntityId("route-table-row");
const EXAMPLE_ROUTINE_ID = testOpaqueEntityId("route-table-routine");

export function programBuilderHttpRouteCases(
  programId: string = EXAMPLE_PROGRAM_ID,
  rowId: string = EXAMPLE_ROW_ID,
  routineId: string = EXAMPLE_ROUTINE_ID,
): readonly ProgramBuilderHttpRouteCase[] {
  return [
    { method: "GET", path: PROGRAMS_API_BASE },
    { method: "POST", path: PROGRAMS_API_BASE },
    { method: "POST", path: programsFromRoutinePath() },
    { method: "GET", path: programsDeletedListPath() },
    { method: "GET", path: routineSentProgramsPath(routineId) },
    { method: "GET", path: programByCodePath("PRG-TEST") },
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

/** Routes scoped to a program id (404 parity for missing vs foreign program). */
export function programBuilderProgram404ParityRouteCases(
  programId: string = EXAMPLE_PROGRAM_ID,
  rowId: string = EXAMPLE_ROW_ID,
): readonly ProgramBuilderHttpRouteCase[] {
  return programBuilderHttpRouteCases(programId, rowId).filter((routeCase) => {
    if (routeCase.path === PROGRAMS_API_BASE) {
      return false;
    }
    if (routeCase.path === programsDeletedListPath()) {
      return false;
    }
    return routeCase.path.includes(encodeURIComponent(programId));
  });
}

export type ProgramBuilderHttpProbeContext = {
  readonly createProgramId: string;
  readonly rowId: string;
  readonly exerciseId: string;
  readonly orderedRowIds: readonly string[];
  readonly duplicateNewRowId: string;
  readonly routineId: string;
  readonly fromRoutineRowIds: readonly string[];
};

export function programBuilderMutatingJsonBodyRouteCases(
  programId: string = EXAMPLE_PROGRAM_ID,
  rowId: string = EXAMPLE_ROW_ID,
): readonly ProgramBuilderHttpRouteCase[] {
  return programBuilderHttpRouteCases(programId, rowId).filter((routeCase) => {
    if (routeCase.method === "DELETE") {
      return false;
    }
    if (routeCase.path === programsDeletedListPath()) {
      return false;
    }
    if (routeCase.path.endsWith("/restore")) {
      return false;
    }
    if (routeCase.path.includes("/library-update/")) {
      return false;
    }
    return ["POST", "PATCH"].includes(routeCase.method);
  });
}

export function programBuilderHttpJsonBody(
  routeCase: ProgramBuilderHttpRouteCase,
  ctx: ProgramBuilderHttpProbeContext,
): string {
  if (routeCase.path === PROGRAMS_API_BASE && routeCase.method === "POST") {
    return JSON.stringify({ program_id: ctx.createProgramId });
  }
  if (routeCase.path === programsFromRoutinePath() && routeCase.method === "POST") {
    return JSON.stringify({
      program_id: ctx.createProgramId,
      routine_id: ctx.routineId,
      source: "community",
      row_ids: [...ctx.fromRoutineRowIds],
    });
  }
  if (routeCase.method === "PATCH" && routeCase.path.endsWith("/reorder")) {
    return JSON.stringify({ ordered_row_ids: [...ctx.orderedRowIds] });
  }
  if (
    routeCase.method === "PATCH" &&
    routeCase.path.includes("/rows/") &&
    !routeCase.path.endsWith("/reorder")
  ) {
    return JSON.stringify({ note: "probe" });
  }
  if (routeCase.method === "PATCH") {
    return JSON.stringify({ name: "probe" });
  }
  if (routeCase.path.endsWith("/duplicate")) {
    return JSON.stringify({ new_row_id: ctx.duplicateNewRowId });
  }
  if (routeCase.path.endsWith("/rows") && routeCase.method === "POST") {
    return JSON.stringify({
      row_id: ctx.rowId,
      exercise_id: ctx.exerciseId,
    });
  }
  return JSON.stringify({});
}
