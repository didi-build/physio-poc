import type { RoutineProgramSource } from "../../services/programs/types.js";
import type { ProgramsClient } from "../api/programs-client.js";
import type { RoutinesClient } from "../api/routines-client.js";

export function resolveRoutineProgramSource(
  hasMyCopy: boolean,
  sourceView: "community" | "mine",
): RoutineProgramSource {
  if (hasMyCopy && sourceView === "mine") {
    return "my_copy";
  }
  return "community";
}

export async function createProgramFromRoutineAtApi(
  client: ProgramsClient,
  input: {
    routineId: string;
    source: RoutineProgramSource;
    rowCount: number;
  },
) {
  const programId = crypto.randomUUID();
  const rowIds = Array.from({ length: input.rowCount }, () => crypto.randomUUID());
  return client.createProgramFromRoutine({
    program_id: programId,
    routine_id: input.routineId,
    source: input.source,
    row_ids: rowIds,
  });
}

export async function createProgramFromRoutineWithDetails(
  programsClient: ProgramsClient,
  routinesClient: RoutinesClient,
  routineId: string,
  sourceOverride?: RoutineProgramSource,
) {
  const details = await routinesClient.getRoutineDetails(routineId);
  const source =
    sourceOverride ??
    (details.my_copy !== null ? ("my_copy" as const) : ("community" as const));
  const rowCount =
    source === "my_copy" && details.my_copy
      ? details.my_copy.rows.length
      : details.community.rows.length;
  return createProgramFromRoutineAtApi(programsClient, {
    routineId,
    source,
    rowCount,
  });
}
