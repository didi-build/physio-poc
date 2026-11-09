import type { ExerciseLibraryClient } from "../../../src/ui/api/exercise-library-client.js";
import type { ExerciseRequestsClient } from "../../../src/ui/api/exercise-requests-client.js";
import type { MyDefaultsClient } from "../../../src/ui/api/my-defaults-client.js";
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
  wrapped.searchApproved = (params, options) => {
    bumpHarnessNavRead("exercises.approved_search");
    return inner.searchApproved(params, options);
  };
  wrapped.listMyExercises = (params, options) => {
    bumpHarnessNavRead("exercises.my_list");
    return inner.listMyExercises(params, options);
  };
  wrapped.getExerciseDetails = (exerciseId, options) => {
    bumpHarnessNavRead("exercises.detail");
    return inner.getExerciseDetails(exerciseId, options);
  };
  return wrapped;
}

export function wrapRoutinesClientWithHarnessCounts(
  inner: RoutinesClient,
): RoutinesClient {
  const wrapped = Object.create(inner) as RoutinesClient;
  wrapped.searchCommunity = (params, options) => {
    bumpHarnessNavRead("routines.community_search");
    return inner.searchCommunity(params, options);
  };
  wrapped.listMyRoutines = (params, options) => {
    bumpHarnessNavRead("routines.my_list");
    return inner.listMyRoutines(params, options);
  };
  wrapped.getRoutineDetails = (routineId, options) => {
    bumpHarnessNavRead("routines.detail");
    return inner.getRoutineDetails(routineId, options);
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

export function wrapExerciseRequestsClientWithHarnessCounts(
  inner: ExerciseRequestsClient,
): ExerciseRequestsClient {
  const wrapped = Object.create(inner) as ExerciseRequestsClient;
  wrapped.listInProgress = (options) => {
    bumpHarnessNavRead("exercise_requests.in_progress_list");
    return inner.listInProgress(options);
  };
  wrapped.getInProgressCount = (options) => {
    bumpHarnessNavRead("exercise_requests.in_progress_count");
    return inner.getInProgressCount(options);
  };
  wrapped.getRequest = (requestId, options) => {
    bumpHarnessNavRead("exercise_requests.detail");
    return inner.getRequest(requestId, options);
  };
  wrapped.listSimilar = (query, options) => {
    bumpHarnessNavRead("exercise_requests.similar");
    return inner.listSimilar(query, options);
  };
  return wrapped;
}

export function wrapMyDefaultsClientWithHarnessCounts(
  inner: MyDefaultsClient,
): MyDefaultsClient {
  const wrapped = Object.create(inner) as MyDefaultsClient;
  wrapped.getPage = (options) => {
    bumpHarnessNavRead("my_defaults.page");
    return inner.getPage(options);
  };
  return wrapped;
}
