import type {
  ApprovedSearchParams,
  MyExercisesListParams,
} from "./exercise-library-client.js";
import type { ProgramOriginFilter } from "../../services/programs/types.js";
import type { CommunitySearchParams, MyRoutinesListParams } from "./routines-client.js";
import { buildSessionReadCacheKey } from "./session-read-cache.js";

export type NavigationReadResource =
  | "exercises.approved_search"
  | "exercises.my_list"
  | "exercises.detail"
  | "routines.community_search"
  | "routines.my_list"
  | "routines.detail"
  | "programs.list"
  | "programs.list_deleted"
  | "programs.builder_by_code";

export function navigationCacheKey(
  sessionEpoch: string,
  resource: NavigationReadResource,
  params: Record<string, unknown>,
): string {
  return buildSessionReadCacheKey(sessionEpoch, { resource, ...params });
}

export function exercisesApprovedSearchKey(
  sessionEpoch: string,
  params: ApprovedSearchParams,
): string {
  return navigationCacheKey(sessionEpoch, "exercises.approved_search", { ...params });
}

export function exercisesMyListKey(
  sessionEpoch: string,
  params: MyExercisesListParams,
): string {
  return navigationCacheKey(sessionEpoch, "exercises.my_list", { ...params });
}

export function exerciseDetailKey(sessionEpoch: string, exerciseId: string): string {
  return navigationCacheKey(sessionEpoch, "exercises.detail", { exerciseId });
}

export function routinesCommunitySearchKey(
  sessionEpoch: string,
  params: CommunitySearchParams,
): string {
  return navigationCacheKey(sessionEpoch, "routines.community_search", { ...params });
}

export function routinesMyListKey(
  sessionEpoch: string,
  params: MyRoutinesListParams,
): string {
  return navigationCacheKey(sessionEpoch, "routines.my_list", { ...params });
}

export function routineDetailKey(sessionEpoch: string, routineId: string): string {
  return navigationCacheKey(sessionEpoch, "routines.detail", { routineId });
}

export function programsListKey(
  sessionEpoch: string,
  searchQuery: string | undefined,
  originFilter: ProgramOriginFilter,
): string {
  return navigationCacheKey(sessionEpoch, "programs.list", {
    q: searchQuery ?? "",
    origin: originFilter,
  });
}

export function programsListUnfilteredKey(sessionEpoch: string): string {
  return programsListKey(sessionEpoch, undefined, "all");
}

export function programsDeletedListKey(sessionEpoch: string): string {
  return navigationCacheKey(sessionEpoch, "programs.list_deleted", {});
}

export function programBuilderByCodeKey(
  sessionEpoch: string,
  programCode: string,
): string {
  return navigationCacheKey(sessionEpoch, "programs.builder_by_code", { programCode });
}

/** Prefix matchers for mutation invalidation (see docs/architecture/navigation-session-read-cache.md). */
export function isExercisesListKey(key: string): boolean {
  return (
    key.includes("|exercises.approved_search|") ||
    key.includes("|exercises.my_list|") ||
    key.includes("|exercise_library.page|")
  );
}

export function isExerciseDetailKey(key: string, exerciseId?: string): boolean {
  if (!key.includes("|exercises.detail|")) {
    return false;
  }
  if (!exerciseId) {
    return true;
  }
  return key.includes(`exerciseId:${exerciseId}`);
}

export function isRoutinesListKey(key: string): boolean {
  return (
    key.includes("|routines.community_search|") ||
    key.includes("|routines.my_list|") ||
    key.includes("|routines.page|")
  );
}

export function isRoutineDetailKey(key: string, routineId?: string): boolean {
  if (!key.includes("|routines.detail|")) {
    return false;
  }
  if (!routineId) {
    return true;
  }
  return key.includes(`routineId:${routineId}`);
}

export function isProgramsListKey(key: string): boolean {
  return (
    key.includes("|programs.list|") ||
    key.includes("|programs.list_deleted|") ||
    key.includes("|programs.page|")
  );
}

export function isProgramBuilderKey(key: string, programCode?: string): boolean {
  if (!key.includes("|programs.builder_by_code|")) {
    return false;
  }
  if (!programCode) {
    return true;
  }
  return key.includes(`programCode:${programCode}`);
}
