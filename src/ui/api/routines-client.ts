import type {
  MyRoutinesListResult,
  RoutineDetailsResult,
  RoutineMutationUndo,
  RoutineSearchSort,
  SearchCommunityRoutinesResult,
} from "../../services/routines/types.js";
import type { RoutineExerciseRow } from "../../services/routines/types.js";
import { type ReadRequestOptions, readGetInit } from "./read-request-options.js";
import {
  ROUTINES_COMMUNITY_SEARCH_PATH,
  ROUTINES_MY_ROUTINES_PATH,
  routineDetailsPath,
  routineMyCopyPath,
} from "../../routine-library-api-paths.js";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RoutinesClientOptions = {
  fetchFn?: FetchFn;
};

export type CommunitySearchParams = {
  q?: string;
  body_region?: string;
  condition_id?: string;
  sort?: RoutineSearchSort;
  cursor?: string;
  limit?: number;
};

export type MyRoutinesListParams = {
  q?: string;
  body_region?: string;
  condition_id?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function buildSearchUrl(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(path, "http://local");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.pathname + url.search;
}

export class RoutinesClient {
  private readonly fetchFn: FetchFn;

  constructor(options: RoutinesClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  searchCommunity(
    params: CommunitySearchParams,
    options?: ReadRequestOptions,
  ): Promise<SearchCommunityRoutinesResult> {
    const path = buildSearchUrl(ROUTINES_COMMUNITY_SEARCH_PATH, {
      q: params.q,
      body_region: params.body_region,
      condition_id: params.condition_id,
      sort: params.sort,
      cursor: params.cursor,
      limit: params.limit !== undefined ? String(params.limit) : undefined,
    });
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<SearchCommunityRoutinesResult>(response),
    );
  }

  listMyRoutines(
    params: MyRoutinesListParams = {},
    options?: ReadRequestOptions,
  ): Promise<MyRoutinesListResult> {
    const path = buildSearchUrl(ROUTINES_MY_ROUTINES_PATH, {
      q: params.q,
      body_region: params.body_region,
      condition_id: params.condition_id,
    });
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<MyRoutinesListResult>(response),
    );
  }

  getRoutineDetails(
    routineId: string,
    options?: ReadRequestOptions,
  ): Promise<RoutineDetailsResult> {
    return this.fetchFn(routineDetailsPath(routineId), readGetInit(options)).then(
      (response) => readJson<RoutineDetailsResult>(response),
    );
  }

  saveToMyRoutines(routineId: string): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save" }),
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }

  removeFromMyRoutines(routineId: string): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }

  adoptCommunityVersion(
    routineId: string,
  ): Promise<{ undo: RoutineMutationUndo; adopted_version: number }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "adopt_community_version" }),
    }).then((response) =>
      readJson<{ undo: RoutineMutationUndo; adopted_version: number }>(response),
    );
  }

  keepMyCopyVersion(routineId: string): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "keep_my_copy" }),
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }

  applyUndo(routineId: string, undo: RoutineMutationUndo): Promise<{ ok: true }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "undo", undo }),
    }).then((response) => readJson<{ ok: true }>(response));
  }

  updateMyCopy(
    routineId: string,
    rows: RoutineExerciseRow[],
  ): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: rows.map((row) => ({
          position: row.position,
          exercise_id: row.exercise_id,
          exercise_version_id: row.exercise_version_id,
          prescription_type: row.prescription_type,
          params: row.params,
        })),
      }),
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }
}

let defaultClient: RoutinesClient | null = null;

export function getRoutinesClient(): RoutinesClient {
  defaultClient ??= new RoutinesClient();
  return defaultClient;
}

export function setRoutinesClientForTests(client: RoutinesClient | null): void {
  defaultClient = client;
}
