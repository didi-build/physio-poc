import type { ExerciseLibraryClient } from "../../../src/ui/api/exercise-library-client.js";
import type { ProgramsClient } from "../../../src/ui/api/programs-client.js";
import type { RoutinesClient } from "../../../src/ui/api/routines-client.js";

export type HarnessNavReadCounts = Record<string, number>;

declare global {
  interface Window {
    __harnessNavReadCounts?: HarnessNavReadCounts;
  }
}

export function resetHarnessNavReadCounts(): void {
  if (typeof window !== "undefined") {
    window.__harnessNavReadCounts = {};
  }
}

export function bumpHarnessNavRead(resource: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.__harnessNavReadCounts ??= {};
  window.__harnessNavReadCounts[resource] =
    (window.__harnessNavReadCounts[resource] ?? 0) + 1;
}

export function wrapExerciseLibraryClientWithHarnessCounts(
  inner: ExerciseLibraryClient,
): ExerciseLibraryClient {
  const wrapped = Object.create(inner) as ExerciseLibraryClient;
  wrapped.searchApproved = (params) => {
    bumpHarnessNavRead("exercises.approved_search");
    return inner.searchApproved(params);
  };
  wrapped.listMyExercises = (params) => {
    bumpHarnessNavRead("exercises.my_list");
    return inner.listMyExercises(params);
  };
  wrapped.getExerciseDetails = (exerciseId) => {
    bumpHarnessNavRead("exercises.detail");
    return inner.getExerciseDetails(exerciseId);
  };
  return wrapped;
}

export function wrapRoutinesClientWithHarnessCounts(
  inner: RoutinesClient,
): RoutinesClient {
  const wrapped = Object.create(inner) as RoutinesClient;
  wrapped.searchCommunity = (params) => {
    bumpHarnessNavRead("routines.community_search");
    return inner.searchCommunity(params);
  };
  wrapped.listMyRoutines = (params) => {
    bumpHarnessNavRead("routines.my_list");
    return inner.listMyRoutines(params);
  };
  wrapped.getRoutineDetails = (routineId) => {
    bumpHarnessNavRead("routines.detail");
    return inner.getRoutineDetails(routineId);
  };
  return wrapped;
}

export function wrapProgramsClientWithHarnessCounts(
  inner: ProgramsClient,
): ProgramsClient {
  const wrapped = Object.create(inner) as ProgramsClient;
  wrapped.listPrograms = (searchQuery, originFilter) => {
    bumpHarnessNavRead("programs.list");
    return inner.listPrograms(searchQuery, originFilter);
  };
  wrapped.listDeletedPrograms = () => {
    bumpHarnessNavRead("programs.list_deleted");
    return inner.listDeletedPrograms();
  };
  wrapped.getProgramByCode = (programCode) => {
    bumpHarnessNavRead("programs.builder_by_code");
    return inner.getProgramByCode(programCode);
  };
  return wrapped;
}
